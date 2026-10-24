import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import { TicketStateMachineFactory } from '../../domain/state-machine/ticket-state-machine.factory';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { ESTADOS_TERMINALES } from '../../domain/state-machine/estados.constants';
import { TicketAsignadoEvent } from '../../domain/events/ticket-asignado.event';
import { ElegibilidadAsignado } from '../services/elegibilidad-asignado';
import { AlcanceActorTicket, cargarTicketParaOperar } from '../services/visibilidad-ticket';
import { esAlcanceDeAdministrador, exigirModificableEnEstado } from '../services/solo-comentarios';
import {
  TicketNoEncontradoError,
  AsignadoInvalidoError,
  AsignadoNoElegibleError,
  TransicionInvalidaError,
  TicketCerradoNoReasignableError,
} from '../../domain/errors/tickets.errors';

/**
 * Camino ORDENADO de estados hasta EN_PROCESO en el grafo base (ADR-3):
 * NUEVO → ASIGNADO → EN_PROCESO. Es la secuencia de arcos que este use case
 * recorre para "poner en proceso" desde el estado actual. NO se hardcodea la
 * validez de los arcos: cada uno se valida contra la máquina de estados
 * resuelta por tipo antes de aplicarse.
 */
const CAMINO_HASTA_EN_PROCESO = ['NUEVO', 'ASIGNADO', 'EN_PROCESO'] as const;

/** Estado destino del flujo combinado. */
const ESTADO_EN_PROCESO = 'EN_PROCESO';

/**
 * DTO de entrada de `AsignarYPonerEnProcesoUseCase`. El alcance del actor (`AlcanceActorTicket`)
 * lo carga la capa de interface (odd/permisos-por-tipo-ticket, D5 c).
 */
export interface AsignarYPonerEnProcesoDto extends AlcanceActorTicket {
  ticketId: string;
  asignadoId: string;
  autorId: string;
  clienteId: string;
}

/**
 * Un paso del avance de estado ya resuelto y validado (pre-transacción): a qué
 * estado se pasa y desde cuál (para registrar la operación CAMBIO_ESTADO con
 * `estadoAnterior`/`estadoNuevo` correctos).
 */
interface PasoTransicion {
  estadoAnteriorId: string;
  estadoNuevo: EstadoEntity;
}

/**
 * AsignarYPonerEnProcesoUseCase — combina, en UNA acción atómica, la
 * asignación manual de un técnico y el avance del ticket hasta EN_PROCESO
 * (rediseño de la asignación: un solo botón "Asignar y poner en proceso").
 *
 * Reusa la MISMA validación de elegibilidad por tipo que
 * `AsignarTicketUseCase` (`ElegibilidadAsignado.aceptaComoResponsable`) — mismos errores
 * (`AsignadoInvalidoError`/`AsignadoNoElegibleError`) — y el MISMO mecanismo de
 * transición que `TransicionarEstadoUseCase` (entidad + máquina de estados por
 * tipo, operaciones de timeline por cada arco).
 *
 * Flujo:
 * 1. Carga el ticket. Si no existe/está soft-deleted o el actor no lo ve
 *    (`esTicketAccesiblePara`: `LECTURA` sobre el tipo y fila) → `TicketNoEncontradoError` (404);
 *    si lo ve sin `ASIGNAR` y `TRANSICIONAR` sobre el tipo → `AccionSobreTipoNoPermitidaError` (403).
 *    Si está CERRADO/CANCELADO → `TicketCerradoNoReasignableError` (422). En RESUELTO, quien no
 *    es ADMINISTRADOR ni ROOT recibe `TicketSoloComentariosError` (422,
 *    odd/cerrado-solo-comentarios); un administrador sigue al paso 4.
 * 2. Valida que el asignado esté activo en el tenant (`estaActivoEnTenant`) →
 *    `AsignadoInvalidoError` (422).
 * 3. Valida elegibilidad por tipo (TECNICO o COLABORADOR con `LECTURA` sobre el tipo del
 *    ticket; no se revalida si el asignado ya es el responsable) →
 *    `AsignadoNoElegibleError` (422).
 * 4. Calcula el camino de arcos desde el estado actual hasta EN_PROCESO
 *    (NUEVO→ASIGNADO→EN_PROCESO; desde ASIGNADO solo →EN_PROCESO; ya en
 *    EN_PROCESO no avanza, solo asigna). Si el estado actual NO puede llegar a
 *    EN_PROCESO por arcos válidos (RESUELTO) →
 *    `TransicionInvalidaError` (422), SIN mutar nada. Cada arco se valida con
 *    la entidad (`canTransitionTo`) Y la máquina de estados (`puedeTransicionar`).
 * 5. En UNA transacción (`ITenantTransactionRunner`), con la fila del ticket
 *    bloqueada ANTES de releerlo (odd/escrituras-manuales-con-lock, S4): vuelve
 *    a decidir "terminal", "solo comentarios", el camino de arcos y, si el paso 3
 *    no la evaluó porque el responsable cambió entre las dos lecturas, la
 *    elegibilidad; y recién
 *    entonces `assignTo` + operación ASIGNACION, por cada arco `updateEstado` +
 *    operación CAMBIO_ESTADO, y persiste el ticket una vez. Las consultas a
 *    master van antes de la transacción, para no sostener el lock mientras se
 *    consulta otra base, salvo en el caso raro de la elegibilidad revalidada:
 *    puede consultar master (`esAgente`, si el asignado tiene `LECTURA`
 *    sobre el tipo) con la fila bloqueada.
 *
 * Un ticket en CERRADO/CANCELADO se rechaza con `TicketCerradoNoReasignableError`
 * (422) antes de consultar a master. Tras el commit publica `ticket.asignado`
 * (origen `MANUAL`) vía `alCommitear`; EN_PROCESO en sí no es un estado
 * notificable (ver `estados-notificables.policy`).
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 */
export class AsignarYPonerEnProcesoUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly estadoRepo: IEstadoRepository,
    private readonly tipoTicketRepo: ITipoTicketRepository,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
    private readonly usuarioMasterChecker: Pick<IUsuarioMasterChecker, 'estaActivoEnTenant'>,
    private readonly elegibilidad: Pick<ElegibilidadAsignado, 'aceptaComoResponsable'>,
    private readonly stateMachineFactory: Pick<TicketStateMachineFactory, 'resolve'>,
    private readonly txRunner: ITenantTransactionRunner,
    private readonly eventPublisher: IDomainEventPublisher,
  ) {}

  async execute(dto: AsignarYPonerEnProcesoDto): Promise<Result<TicketEntity, DomainError>> {
    const ticketResult = await cargarTicketParaOperar(
      this.ticketRepo,
      dto.ticketId,
      dto,
      'ASIGNAR',
      'TRANSICIONAR',
    );
    if (ticketResult.isFail()) return Result.fail(ticketResult.getError());
    const ticket = ticketResult.getValue();

    // Catálogos FIJOS (ADR-1): su ausencia es un bug de infraestructura → throw
    // defensivo (mismo patrón que TransicionarEstadoUseCase).
    const estadoActual = await this.estadoRepo.findById(ticket.estadoId);
    if (!estadoActual) {
      throw new Error(
        `Catálogo de estados inconsistente: no existe el estado con id "${ticket.estadoId}" en el tenant activo.`,
      );
    }
    // M1: terminal antes de las validaciones del asignado y de resolver los pasos.
    if (ESTADOS_TERMINALES.has(estadoActual.codigo)) {
      return Result.fail(new TicketCerradoNoReasignableError(ticket.id, estadoActual.codigo));
    }
    // RESUELTO: quien no es administrador solo comenta (odd/cerrado-solo-comentarios).
    const esAdministrador = esAlcanceDeAdministrador(dto);
    const modificable = exigirModificableEnEstado(estadoActual.codigo, esAdministrador);
    if (modificable.isFail()) return Result.fail(modificable.getError());

    const asignadoActivo = await this.usuarioMasterChecker.estaActivoEnTenant(
      dto.asignadoId,
      dto.clienteId,
    );
    if (!asignadoActivo) {
      return Result.fail(new AsignadoInvalidoError(dto.asignadoId));
    }

    const mantieneResponsable = ticket.asignadoId === dto.asignadoId;
    if (!(await this.elegibilidad.aceptaComoResponsable(ticket, dto.asignadoId, dto.clienteId))) {
      return Result.fail(new AsignadoNoElegibleError(dto.asignadoId, ticket.tipoId));
    }

    const tipoTicket = await this.tipoTicketRepo.findById(ticket.tipoId);
    if (!tipoTicket) {
      throw new Error(
        `Catálogo de tipos de ticket inconsistente: no existe el tipo con id "${ticket.tipoId}" en el tenant activo.`,
      );
    }

    // Resuelve y valida el camino de arcos hasta EN_PROCESO ANTES de la
    // transacción (nada se muta si algún arco es inválido).
    const pasosResult = await this.resolverPasosHastaEnProceso(
      ticket,
      estadoActual,
      tipoTicket.codigo,
    );
    if (pasosResult.isFail()) {
      return Result.fail(pasosResult.getError());
    }

    const tipoOpAsignacionId = await this.tipoOperacionRepo.findIdByCodigo('ASIGNACION');
    if (!tipoOpAsignacionId) {
      throw new Error(
        'Catálogo de tipo_operacion inconsistente: no existe "ASIGNACION" en el tenant activo.',
      );
    }
    const tipoOpCambioEstadoId = await this.tipoOperacionRepo.findIdByCodigo('CAMBIO_ESTADO');
    if (!tipoOpCambioEstadoId) {
      throw new Error(
        'Catálogo de tipo_operacion inconsistente: no existe "CAMBIO_ESTADO" en el tenant activo.',
      );
    }

    // Dentro de la tx, con la fila bloqueada ANTES de releer (odd/escrituras-manuales-con-lock, S4):
    // el camino de arcos se vuelve a resolver sobre el estado vigente. El de arriba sirvió para
    // rechazar temprano, sin abrir la transacción; este es el que se escribe.
    const escritura = await this.txRunner.run(
      async (): Promise<Result<TicketEntity, DomainError>> => {
        await this.ticketRepo.bloquear(dto.ticketId);
        const ticket = await this.ticketRepo.findById(dto.ticketId);
        if (!ticket || ticket.isDeleted()) {
          return Result.fail(new TicketNoEncontradoError(dto.ticketId));
        }
        const estadoVigente = await this.estadoRepo.findById(ticket.estadoId);
        if (!estadoVigente) {
          throw new Error(
            `Catálogo de estados inconsistente: no existe el estado con id "${ticket.estadoId}" en el tenant activo.`,
          );
        }
        if (ESTADOS_TERMINALES.has(estadoVigente.codigo)) {
          return Result.fail(new TicketCerradoNoReasignableError(ticket.id, estadoVigente.codigo));
        }
        const vigente = exigirModificableEnEstado(estadoVigente.codigo, esAdministrador);
        if (vigente.isFail()) return Result.fail(vigente.getError());
        // Mismo criterio que AsignarTicketUseCase: lo que arriba no se validó por ser el responsable
        // se valida ahora si otro actor lo cambió entre las dos lecturas.
        if (
          mantieneResponsable &&
          !(await this.elegibilidad.aceptaComoResponsable(ticket, dto.asignadoId, dto.clienteId))
        ) {
          return Result.fail(new AsignadoNoElegibleError(dto.asignadoId, ticket.tipoId));
        }
        const pasosVigentes = await this.resolverPasosHastaEnProceso(
          ticket,
          estadoVigente,
          tipoTicket.codigo,
        );
        if (pasosVigentes.isFail()) return Result.fail(pasosVigentes.getError());

        // 1) Asignación + operación ASIGNACION (sin estados: no es un cambio de estado).
        ticket.assignTo(dto.asignadoId);
        await this.operacionRepo.save(
          OperacionTicketEntity.create({
            ticketId: ticket.id,
            tipoOperacionId: tipoOpAsignacionId,
            descripcion: null,
            estadoAnteriorId: null,
            estadoNuevoId: null,
            autorId: dto.autorId,
            esInterno: false,
            metadata: null,
          }),
        );

        // 2) Avance de estado arco por arco + operación CAMBIO_ESTADO por cada uno.
        for (const paso of pasosVigentes.getValue()) {
          ticket.updateEstado(paso.estadoNuevo.id);
          await this.operacionRepo.save(
            OperacionTicketEntity.create({
              ticketId: ticket.id,
              tipoOperacionId: tipoOpCambioEstadoId,
              descripcion: null,
              estadoAnteriorId: paso.estadoAnteriorId,
              estadoNuevoId: paso.estadoNuevo.id,
              autorId: dto.autorId,
              esInterno: false,
              metadata: null,
            }),
          );
        }

        await this.ticketRepo.save(ticket);
        return Result.ok(ticket);
      },
    );
    if (escritura.isFail()) return Result.fail(escritura.getError());
    const asignado = escritura.getValue();

    // N1: el evento sale recién al commit de la transacción más externa.
    this.txRunner.alCommitear(() => {
      this.eventPublisher.publish(
        new TicketAsignadoEvent({
          ticketId: asignado.id,
          asignadoId: dto.asignadoId,
          origen: 'MANUAL',
          autorId: dto.autorId,
        }),
      );
    });

    return Result.ok(asignado);
  }

  /**
   * Resuelve la secuencia de arcos a recorrer desde el estado actual hasta
   * EN_PROCESO, validando CADA arco con la entidad y la máquina de estados por
   * tipo. Devuelve `Result.fail(TransicionInvalidaError)` si el estado actual
   * no está en el camino a EN_PROCESO (RESUELTO/CERRADO/CANCELADO) o si algún
   * arco resulta inválido. Un ticket ya en EN_PROCESO devuelve `[]` (solo se
   * asignará, sin cambio de estado).
   */
  private async resolverPasosHastaEnProceso(
    ticket: TicketEntity,
    estadoActual: EstadoEntity,
    tipoCodigo: string,
  ): Promise<Result<PasoTransicion[], DomainError>> {
    const idxActual = CAMINO_HASTA_EN_PROCESO.indexOf(
      estadoActual.codigo as (typeof CAMINO_HASTA_EN_PROCESO)[number],
    );
    if (idxActual === -1) {
      // RESUELTO/CERRADO/CANCELADO: fuera del camino a EN_PROCESO.
      return Result.fail(new TransicionInvalidaError(estadoActual.codigo, ESTADO_EN_PROCESO));
    }

    const codigosRestantes = CAMINO_HASTA_EN_PROCESO.slice(idxActual + 1);
    const maquina = this.stateMachineFactory.resolve(tipoCodigo);

    const pasos: PasoTransicion[] = [];
    let desdeCodigo = estadoActual.codigo;
    let desdeId = ticket.estadoId;

    for (const haciaCodigo of codigosRestantes) {
      const estadoDestino = await this.estadoRepo.findByCodigo(haciaCodigo);
      if (!estadoDestino) {
        throw new Error(
          `Catálogo de estados inconsistente: no existe el estado con código "${haciaCodigo}" en el tenant activo.`,
        );
      }

      const entidadPermite = ticket.canTransitionTo(desdeCodigo, haciaCodigo);
      const arcoValido = maquina.puedeTransicionar(desdeCodigo, haciaCodigo, {});
      if (!entidadPermite || !arcoValido) {
        return Result.fail(new TransicionInvalidaError(desdeCodigo, haciaCodigo));
      }

      pasos.push({ estadoAnteriorId: desdeId, estadoNuevo: estadoDestino });
      desdeCodigo = haciaCodigo;
      desdeId = estadoDestino.id;
    }

    return Result.ok(pasos);
  }
}
