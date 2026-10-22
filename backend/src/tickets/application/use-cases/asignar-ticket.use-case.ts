import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { ESTADOS_TERMINALES } from '../../domain/state-machine/estados.constants';
import { TicketAsignadoEvent } from '../../domain/events/ticket-asignado.event';
import { ElegibilidadAsignado } from '../services/elegibilidad-asignado';
import { AlcanceActorTicket, cargarTicketParaOperar } from '../services/visibilidad-ticket';
import {
  TicketNoEncontradoError,
  AsignadoInvalidoError,
  AsignadoNoElegibleError,
  TicketCerradoNoReasignableError,
} from '../../domain/errors/tickets.errors';

/**
 * DTO de entrada de `AsignarTicketUseCase`.
 *
 * - `asignadoId`: UUID del usuario que recibirá la asignación (soft ref a
 *   master.usuarios). Puede ser el propio `autorId` (un agente "toma" un
 *   ticket) o un tercero (un COLABORADOR/TECNICO+ con `ticket:asignar` se
 *   lo asigna a otro) — el use case no distingue ambos casos, ambos son
 *   asignación MANUAL (T14). La asignación AUTOMÁTICA por regla de tipo
 *   (sin acción humana) vive en el alta del ticket, no en este flujo; un
 *   ticket nacido por regla se reasigna acá igual que cualquier otro.
 * - `clienteId`: `cliente_id` del JWT — usado SOLO para la validación
 *   cross-DB del asignado (`IUsuarioMasterChecker.estaActivoEnTenant`).
 * - `autorId`: `sub` del JWT del actor que ejecuta la acción (quien tiene
 *   `ticket:asignar`, verificado por `PermissionsGuard` en la capa de
 *   interface) — se registra como autor de la operación de timeline.
 * - El alcance del actor (`AlcanceActorTicket`) lo carga la capa de interface: lo que
 *   el actor no ve, tampoco lo asigna (odd/permisos-por-tipo-ticket, D5 c).
 */
export interface AsignarTicketDto extends AlcanceActorTicket {
  ticketId: string;
  asignadoId: string;
  clienteId: string;
  autorId: string;
}

/**
 * AsignarTicketUseCase — asignación manual de un responsable a un ticket
 * (T14, T15).
 *
 * Flujo:
 * 1. Carga el ticket. Si no existe, está soft-deleted o el actor no lo ve
 *    (`esTicketAccesiblePara`: `LECTURA` sobre el tipo y fila) → `TicketNoEncontradoError` (404);
 *    si lo ve sin `ASIGNAR` sobre el tipo → `AccionSobreTipoNoPermitidaError` (403).
 *    Si está en un estado final (CERRADO/CANCELADO) → `TicketCerradoNoReasignableError`
 *    (422), antes de consultar a master. RESUELTO sí se reasigna.
 * 2. Valida que el asignado existe en `master.usuarios` con `activo=true` y
 *    pertenece (vía membresía activa) al tenant activo (cross-DB,
 *    `IUsuarioMasterChecker.estaActivoEnTenant`). Si no → `AsignadoInvalidoError` (422).
 * 3. Valida elegibilidad POR TIPO (`ElegibilidadAsignado.esAsignableATipo`,
 *    odd/permisos-por-tipo-ticket, D5 g): el asignado es elegible si es
 *    ROOT/ADMINISTRADOR o si tiene `LECTURA` sobre el tipo ACTUAL del ticket
 *    en `permisos_tipo_ticket`. Si no → `AsignadoNoElegibleError` (422).
 *    Ortogonal al permiso de asignar del actor (T15): un actor con el permiso
 *    puede intentar asignar a alguien sin el tipo y de todos modos falla acá.
 * 4. Resuelve el id del tipo de operación `ASIGNACION` del catálogo tenant
 *    (catálogo FIJO garantizado por el seed — su ausencia es un fallo de
 *    infraestructura, no un error del caller: `throw` defensivo, mismo
 *    patrón que `CrearTicketUseCase`/`TransicionarEstadoUseCase`).
 * 5. **DENTRO de la transacción** (`ITenantTransactionRunner.run`, T24), y en
 *    este orden (odd/escrituras-manuales-con-lock, S3): bloquea la fila del
 *    ticket, lo RELEE y vuelve a decidir "terminal" y "era NUEVO" sobre ese
 *    estado vigente; recién entonces `ticket.assignTo(asignadoId)`, crea la
 *    operación `ASIGNACION` del timeline (sin `estadoAnterior`/`estadoNuevo` —
 *    no es un cambio de estado, T9/T12 siguen siendo el único camino para
 *    transicionar), y persiste ambos. La lectura del paso 1 sirve para el 404,
 *    el rechazo temprano del terminal y las consultas a master, que quedan
 *    fuera de la transacción para no sostener el lock mientras se consulta
 *    otra base.
 *
 * Un ticket en NUEVO pasa a ASIGNADO en la MISMA transacción (operación
 * `CAMBIO_ESTADO NUEVO → ASIGNADO` del actor, además de la `ASIGNACION`): un
 * ticket con responsable no puede quedar en Nuevo. En cualquier otro estado
 * abierto la asignación NO cambia el estado. Tras el commit publica
 * `ticket.asignado` (origen `MANUAL`, `autorId` = actor) vía `alCommitear`.
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/tickets-core/spec T14, T15. Tarea: T8.1, T8.2.
 */
export class AsignarTicketUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly usuarioMasterChecker: Pick<IUsuarioMasterChecker, 'estaActivoEnTenant'>,
    private readonly elegibilidad: Pick<ElegibilidadAsignado, 'esAsignableATipo'>,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
    private readonly txRunner: ITenantTransactionRunner,
    private readonly estadoRepo: Pick<IEstadoRepository, 'findById' | 'findIdByCodigo'>,
    private readonly eventPublisher: IDomainEventPublisher,
  ) {}

  async execute(dto: AsignarTicketDto): Promise<Result<TicketEntity, DomainError>> {
    const ticketResult = await cargarTicketParaOperar(
      this.ticketRepo,
      dto.ticketId,
      dto,
      'ASIGNAR',
    );
    if (ticketResult.isFail()) return Result.fail(ticketResult.getError());
    const ticket = ticketResult.getValue();

    // M1: terminal antes de las validaciones del asignado (determinista, sin master).
    const estadoActual = await this.estadoRepo.findById(ticket.estadoId);
    if (!estadoActual) {
      throw new Error(
        `Catálogo de estados inconsistente: no existe el estado con id "${ticket.estadoId}" en el tenant activo.`,
      );
    }
    if (ESTADOS_TERMINALES.has(estadoActual.codigo)) {
      return Result.fail(new TicketCerradoNoReasignableError(ticket.id, estadoActual.codigo));
    }

    const asignadoActivo = await this.usuarioMasterChecker.estaActivoEnTenant(
      dto.asignadoId,
      dto.clienteId,
    );
    if (!asignadoActivo) {
      return Result.fail(new AsignadoInvalidoError(dto.asignadoId));
    }

    // Elegibilidad por tipo (regla compartida con AsignarYPonerEnProcesoUseCase):
    // ROOT/ADMINISTRADOR pueden todo; el resto, solo con LECTURA sobre el tipo del ticket.
    const esElegible = await this.elegibilidad.esAsignableATipo(
      dto.asignadoId,
      dto.clienteId,
      ticket.tipoId,
    );
    if (!esElegible) {
      return Result.fail(new AsignadoNoElegibleError(dto.asignadoId, ticket.tipoId));
    }

    // Catálogo FIJO garantizado por el seed — su ausencia es un bug de
    // infraestructura, no un error del caller: throw defensivo (mismo
    // patrón que CrearTicketUseCase/TransicionarEstadoUseCase).
    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('ASIGNACION');
    if (!tipoOperacionId) {
      throw new Error(
        'Catálogo de tipo_operacion inconsistente: no existe "ASIGNACION" en el tenant activo.',
      );
    }

    // M3: los ids de ASIGNADO y CAMBIO_ESTADO se resuelven antes de la tx; si el ticket sigue
    // NUEVO al releerlo con la fila bloqueada, pasa a ASIGNADO.
    const estadoAsignadoId = await this.estadoRepo.findIdByCodigo('ASIGNADO');
    const tipoCambioEstadoId = await this.tipoOperacionRepo.findIdByCodigo('CAMBIO_ESTADO');
    if (!estadoAsignadoId || !tipoCambioEstadoId) {
      throw new Error(
        'Catálogos inconsistentes: faltan el estado "ASIGNADO" o el tipo_operacion "CAMBIO_ESTADO" en el tenant activo.',
      );
    }

    // Dentro de la tx, con la fila bloqueada ANTES de releer (odd/escrituras-manuales-con-lock, S3):
    // el estado que decide "terminal" y "era NUEVO" es el actual, no el de la lectura de arriba, que
    // sirvió para el 404, el tipo y las consultas a master. El guardado de la fila entera ya no
    // puede pisar un estado que otro actor —o las tareas— acaba de dejar.
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
        const eraNuevo = estadoVigente.codigo === 'NUEVO';
        const estadoAnteriorId = ticket.estadoId;

        ticket.assignTo(dto.asignadoId);

        const operacion = OperacionTicketEntity.create({
          ticketId: ticket.id,
          tipoOperacionId,
          descripcion: null,
          estadoAnteriorId: null,
          estadoNuevoId: null,
          autorId: dto.autorId,
          esInterno: false,
          metadata: null,
        });

        await this.operacionRepo.save(operacion);

        if (eraNuevo) {
          ticket.updateEstado(estadoAsignadoId);
          await this.operacionRepo.save(
            OperacionTicketEntity.create({
              ticketId: ticket.id,
              tipoOperacionId: tipoCambioEstadoId,
              descripcion: null,
              estadoAnteriorId,
              estadoNuevoId: estadoAsignadoId,
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
}
