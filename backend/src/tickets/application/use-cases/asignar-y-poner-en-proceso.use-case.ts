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
import { esAsignadoElegiblePorModulo } from '../services/elegibilidad-asignado';
import {
  TicketNoEncontradoError,
  AsignadoInvalidoError,
  AsignadoNoElegibleError,
  TransicionInvalidaError,
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

/** DTO de entrada de `AsignarYPonerEnProcesoUseCase`. */
export interface AsignarYPonerEnProcesoDto {
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
 * Reusa la MISMA validación de elegibilidad por módulo que
 * `AsignarTicketUseCase` (`esAsignadoElegiblePorModulo`) — mismos errores
 * (`AsignadoInvalidoError`/`AsignadoNoElegibleError`) — y el MISMO mecanismo de
 * transición que `TransicionarEstadoUseCase` (entidad + máquina de estados por
 * tipo, operaciones de timeline por cada arco).
 *
 * Flujo:
 * 1. Carga el ticket. Si no existe/está soft-deleted → `TicketNoEncontradoError` (404).
 * 2. Valida que el asignado esté activo en el tenant (`estaActivoEnTenant`) →
 *    `AsignadoInvalidoError` (422).
 * 3. Valida elegibilidad por módulo del tipo → `AsignadoNoElegibleError` (422).
 * 4. Calcula el camino de arcos desde el estado actual hasta EN_PROCESO
 *    (NUEVO→ASIGNADO→EN_PROCESO; desde ASIGNADO solo →EN_PROCESO; ya en
 *    EN_PROCESO no avanza, solo asigna). Si el estado actual NO puede llegar a
 *    EN_PROCESO por arcos válidos (RESUELTO/CERRADO/CANCELADO) →
 *    `TransicionInvalidaError` (422), SIN mutar nada. Cada arco se valida con
 *    la entidad (`canTransitionTo`) Y la máquina de estados (`puedeTransicionar`).
 * 5. En UNA transacción (`ITenantTransactionRunner`): `assignTo` + operación
 *    ASIGNACION, luego por cada arco `updateEstado` + operación CAMBIO_ESTADO,
 *    y persiste el ticket una vez.
 *
 * No publica eventos: EN_PROCESO no es un estado notificable (los notificables
 * son RESUELTO/CERRADO — ver `estados-notificables.policy`).
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
    private readonly usuarioMasterChecker: Pick<
      IUsuarioMasterChecker,
      'estaActivoEnTenant' | 'getAutorizacionModulos'
    >,
    private readonly stateMachineFactory: Pick<TicketStateMachineFactory, 'resolve'>,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: AsignarYPonerEnProcesoDto): Promise<Result<TicketEntity, DomainError>> {
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (!ticket || ticket.isDeleted()) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }

    const asignadoActivo = await this.usuarioMasterChecker.estaActivoEnTenant(
      dto.asignadoId,
      dto.clienteId,
    );
    if (!asignadoActivo) {
      return Result.fail(new AsignadoInvalidoError(dto.asignadoId));
    }

    const esElegible = await esAsignadoElegiblePorModulo(
      dto.asignadoId,
      dto.clienteId,
      ticket.tipoId,
      this.usuarioMasterChecker,
      this.tipoTicketRepo,
    );
    if (!esElegible) {
      return Result.fail(new AsignadoNoElegibleError(dto.asignadoId, ticket.tipoId));
    }

    // Catálogos FIJOS (ADR-1): su ausencia es un bug de infraestructura → throw
    // defensivo (mismo patrón que TransicionarEstadoUseCase).
    const estadoActual = await this.estadoRepo.findById(ticket.estadoId);
    if (!estadoActual) {
      throw new Error(
        `Catálogo de estados inconsistente: no existe el estado con id "${ticket.estadoId}" en el tenant activo.`,
      );
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
    const pasos = pasosResult.getValue();

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

    await this.txRunner.run(async () => {
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
      for (const paso of pasos) {
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
    });

    return Result.ok(ticket);
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
