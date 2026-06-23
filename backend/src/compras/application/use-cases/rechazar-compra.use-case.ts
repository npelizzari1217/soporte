import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketStateMachineFactory } from '../../../tickets/domain/state-machine/ticket-state-machine.factory';
import {
  EstadoCatalogoNoEncontradoError,
  TicketNoEncontradoError,
  TipoOperacionNoEncontradoError,
  TipoTicketNoEncontradoError,
  TransicionInvalidaError,
} from '../../../tickets/domain/errors/tickets.errors';
import { IEstadoRepository } from '../../../tickets/domain/ports/i-estado.repository';
import { IOperacionTicketRepository } from '../../../tickets/domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { ITicketCompraRepository } from '../../domain/ports/i-ticket-compra.repository';
import {
  MotivoRechazoRequeridoError,
  TicketCompraNoEncontradoError,
} from '../../domain/errors/compras.errors';
import { TicketCompraEntity } from '../../domain/entities/ticket-compra.entity';

/**
 * DTO de entrada para rechazar una compra.
 */
export interface RechazarCompraDto {
  /** UUID del ticket de compra a rechazar. */
  ticketId: string;
  /** UUID del usuario que rechaza (soft ref → master.usuarios; extraído del JWT). */
  aprobadoPorId: string;
  /** Texto explicativo del rechazo. Obligatorio y no puede estar en blanco. */
  motivoRechazo: string;
}

/**
 * RechazarCompraUseCase — rechaza un ticket de compra en estado PENDIENTE_APROBACION.
 *
 * Realiza una DOBLE TRANSICIÓN atómica, ambas validadas vía ComprasStateMachine:
 *   PENDIENTE_APROBACION → RECHAZADO → CERRADO
 *
 * Esto produce dos operaciones de timeline `operaciones_ticket` en la misma transacción.
 * Al finalizar, el ticket queda en estado CERRADO (terminal).
 *
 * Flujo:
 * 1. Valida motivoRechazo no vacío → falla rápido sin tocar la DB.
 * 2. Carga el ticket → 404 si no existe o está eliminado.
 * 3. Busca el satélite ticket_compra → falla si no existe.
 * 4. Resuelve el estado actual desde el catálogo.
 * 5. Resuelve tipoCodigo y obtiene la ComprasStateMachine vía factory.
 * 6. Evalúa puedeTransicionar(estadoActual, 'RECHAZADO') — falla si rechazada.
 * 7. Evalúa puedeTransicionar('RECHAZADO', 'CERRADO') — falla si rechazada.
 * 8. Resuelve estados RECHAZADO y CERRADO del catálogo.
 * 9. Resuelve tipo_operacion CAMBIO_ESTADO.
 * 10. Llama ticketCompra.rechazar(aprobadoPorId, now, motivoRechazo).
 * 11. Primera transición: ticket.updateEstado(RECHAZADO) + crea operacion1.
 * 12. Segunda transición: ticket.updateEstado(CERRADO) + crea operacion2.
 * 13. Persiste ticket + ticketCompra + operacion1 + operacion2 en una sola tx (atómico).
 * 14. Retorna Result.ok(ticket) con estadoId = CERRADO.
 *
 * La validación de AMBAS transiciones se delega a la Strategy para respetar
 * la fuente única de verdad (ComprasStateMachine). La máquina define:
 *   PENDIENTE_APROBACION → RECHAZADO (válida)
 *   RECHAZADO → CERRADO (válida)
 *
 * NOTA: El gate de permiso `compra:aprobar` se verifica en el guard de interface.
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:compras/Gate de aprobación, Rechazo automático al CERRADO]
 * Tarea: 4.B.5 / 4.B.6
 */
export class RechazarCompraUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly ticketCompraRepo: ITicketCompraRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly estadoRepo: IEstadoRepository,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
    private readonly tipoTicketRepo: ITipoTicketRepository,
    private readonly factory: Pick<TicketStateMachineFactory, 'resolve'>,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(
    dto: RechazarCompraDto,
  ): Promise<Result<{ ticket: TicketEntity; ticketCompra: TicketCompraEntity }, DomainError>> {
    // 1. Validación anticipada: motivoRechazo no puede estar vacío ni ser solo espacios
    if (!dto.motivoRechazo || dto.motivoRechazo.trim() === '') {
      return Result.fail(new MotivoRechazoRequeridoError());
    }

    // 2. Cargar el ticket; tratar soft-deleted como no encontrado
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (!ticket || ticket.isDeleted()) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }

    // 3. Verificar que el satélite ticket_compra existe
    const ticketCompra = await this.ticketCompraRepo.findByTicketId(ticket.id);
    if (!ticketCompra) {
      return Result.fail(new TicketCompraNoEncontradoError(ticket.id));
    }

    // 4. Resolver el estado actual
    const estadoActual = await this.estadoRepo.findById(ticket.estadoId);
    if (!estadoActual) {
      return Result.fail(new EstadoCatalogoNoEncontradoError(ticket.estadoId));
    }

    // 5. Resolver tipoCodigo y obtener la máquina de estados para este tipo de ticket.
    //    Delegar la validación a la Strategy (ComprasStateMachine) — fuente única de verdad.
    const tipoCodigo = await this.tipoTicketRepo.findCodigoById(ticket.tipoId);
    if (!tipoCodigo) {
      return Result.fail(new TipoTicketNoEncontradoError(ticket.tipoId));
    }
    const machine = this.factory.resolve(tipoCodigo);

    // 6. Validar primera transición: estadoActual → RECHAZADO
    if (!machine.puedeTransicionar(estadoActual.codigo, 'RECHAZADO', {})) {
      return Result.fail(
        new TransicionInvalidaError(
          estadoActual.codigo,
          'RECHAZADO',
          `ComprasStateMachine rechaza la transición "${estadoActual.codigo}" → "RECHAZADO".`,
        ),
      );
    }

    // 7. Validar segunda transición: RECHAZADO → CERRADO (cierre automático post-rechazo)
    if (!machine.puedeTransicionar('RECHAZADO', 'CERRADO', {})) {
      return Result.fail(
        new TransicionInvalidaError(
          'RECHAZADO',
          'CERRADO',
          `ComprasStateMachine rechaza la transición "RECHAZADO" → "CERRADO".`,
        ),
      );
    }

    // 8. Resolver los estados destino RECHAZADO y CERRADO
    const estadoRechazado = await this.estadoRepo.findByCodigo('RECHAZADO');
    if (!estadoRechazado) {
      return Result.fail(new EstadoCatalogoNoEncontradoError('RECHAZADO'));
    }
    const estadoCerrado = await this.estadoRepo.findByCodigo('CERRADO');
    if (!estadoCerrado) {
      return Result.fail(new EstadoCatalogoNoEncontradoError('CERRADO'));
    }

    // 9. Resolver tipo_operacion CAMBIO_ESTADO
    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('CAMBIO_ESTADO');
    if (!tipoOperacionId) {
      return Result.fail(new TipoOperacionNoEncontradoError('CAMBIO_ESTADO'));
    }

    // 10. Registrar el rechazo en el satélite (aprobadoPorId + aprobadoEn + motivoRechazo)
    ticketCompra.rechazar(dto.aprobadoPorId, new Date(), dto.motivoRechazo);

    // 11. Primera transición: PENDIENTE_APROBACION → RECHAZADO
    ticket.updateEstado(estadoRechazado.id);
    const operacion1 = OperacionTicketEntity.create({
      ticketId: ticket.id,
      tipoOperacionId,
      descripcion: null,
      estadoAnteriorId: estadoActual.id,
      estadoNuevoId: estadoRechazado.id,
      autorId: dto.aprobadoPorId,
      metadata: null,
    });

    // 12. Segunda transición: RECHAZADO → CERRADO (cierre automático)
    ticket.updateEstado(estadoCerrado.id);
    const operacion2 = OperacionTicketEntity.create({
      ticketId: ticket.id,
      tipoOperacionId,
      descripcion: null,
      estadoAnteriorId: estadoRechazado.id,
      estadoNuevoId: estadoCerrado.id,
      autorId: dto.aprobadoPorId,
      metadata: null,
    });

    // 13. Persistir todo en una sola transacción atómica
    await this.txRunner.run(async () => {
      await this.ticketRepo.save(ticket);
      await this.ticketCompraRepo.save(ticketCompra);
      await this.operacionRepo.save(operacion1);
      await this.operacionRepo.save(operacion2);
    });

    return Result.ok({ ticket, ticketCompra });
  }
}
