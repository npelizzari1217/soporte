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
import { IItemCompraRepository } from '../../domain/ports/i-item-compra.repository';
import { ITicketCompraRepository } from '../../domain/ports/i-ticket-compra.repository';
import {
  SinItemsActivosError,
  TicketCompraNoEncontradoError,
} from '../../domain/errors/compras.errors';

/**
 * DTO de entrada para enviar un ticket de compra a aprobación.
 */
export interface EnviarAAprobacionDto {
  /** UUID del ticket de compra a enviar. */
  ticketId: string;
  /** UUID del usuario que realiza la acción (del JWT). */
  autorId: string;
}

/**
 * EnviarAAprobacionUseCase — transiciona un ticket COMPRAS de ABIERTO a PENDIENTE_APROBACION.
 *
 * Flujo:
 * 1. Carga el ticket → 404 si no existe o está eliminado.
 * 2. Busca el satélite ticket_compra → falla si no existe (ticket no es COMPRAS).
 * 3. Verifica que haya al menos 1 ítem activo (deleted_at IS NULL) → 422 si no.
 * 4. Resuelve estado actual y estado destino PENDIENTE_APROBACION del catálogo.
 * 5. Verifica invariantes de entidad vía ticket.canTransitionTo().
 * 6. Resuelve tipoCodigo y usa la factory para obtener la ComprasStateMachine.
 * 7. Evalúa puedeTransicionar() → 422 si rechazada.
 * 8. Resuelve tipo_operacion CAMBIO_ESTADO.
 * 9. Actualiza ticket.estadoId y crea OperacionTicketEntity.
 * 10. Persiste ticket + operacion en misma transacción (atómico).
 * 11. Retorna Result.ok(ticket).
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:compras/Envío a aprobación, Gestión de ítems]
 * Tarea: 4.B.3 / 4.B.4
 */
export class EnviarAAprobacionUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly ticketCompraRepo: ITicketCompraRepository,
    private readonly itemCompraRepo: IItemCompraRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly estadoRepo: IEstadoRepository,
    private readonly tipoTicketRepo: ITipoTicketRepository,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
    private readonly factory: Pick<TicketStateMachineFactory, 'resolve'>,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: EnviarAAprobacionDto): Promise<Result<TicketEntity, DomainError>> {
    // 1. Cargar el ticket; tratar soft-deleted como no encontrado
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (!ticket || ticket.isDeleted()) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }

    // 2. Verificar que el satélite ticket_compra existe (confirma que es un ticket COMPRAS)
    const ticketCompra = await this.ticketCompraRepo.findByTicketId(ticket.id);
    if (!ticketCompra) {
      return Result.fail(new TicketCompraNoEncontradoError(ticket.id));
    }

    // 3. Verificar que existe al menos 1 ítem activo (deleted_at IS NULL)
    const itemsActivos = await this.itemCompraRepo.findActiveByTicketCompraId(ticketCompra.id);
    if (itemsActivos.length === 0) {
      return Result.fail(new SinItemsActivosError(ticketCompra.id));
    }

    // 4. Resolver el estado actual del ticket desde el catálogo
    const estadoActual = await this.estadoRepo.findById(ticket.estadoId);
    if (!estadoActual) {
      return Result.fail(new EstadoCatalogoNoEncontradoError(ticket.estadoId));
    }

    // 5. Resolver el estado destino PENDIENTE_APROBACION del catálogo
    const estadoPendiente = await this.estadoRepo.findByCodigo('PENDIENTE_APROBACION');
    if (!estadoPendiente) {
      return Result.fail(new EstadoCatalogoNoEncontradoError('PENDIENTE_APROBACION'));
    }

    // 6. Verificar invariantes de la entidad (soft-delete, estados terminales)
    if (!ticket.canTransitionTo(estadoActual.codigo, estadoPendiente.codigo)) {
      return Result.fail(
        new TransicionInvalidaError(
          estadoActual.codigo,
          estadoPendiente.codigo,
          'Invariante de entidad: ticket eliminado o en estado terminal.',
        ),
      );
    }

    // 7. Resolver tipoCodigo y obtener la máquina de estados para COMPRAS
    const tipoCodigo = await this.tipoTicketRepo.findCodigoById(ticket.tipoId);
    if (!tipoCodigo) {
      return Result.fail(new TipoTicketNoEncontradoError(ticket.tipoId));
    }
    const machine = this.factory.resolve(tipoCodigo);

    // 8. Evaluar si la transición es válida según ComprasStateMachine
    if (!machine.puedeTransicionar(estadoActual.codigo, estadoPendiente.codigo, {})) {
      return Result.fail(new TransicionInvalidaError(estadoActual.codigo, estadoPendiente.codigo));
    }

    // 9. Resolver el id del tipo de operación CAMBIO_ESTADO
    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('CAMBIO_ESTADO');
    if (!tipoOperacionId) {
      return Result.fail(new TipoOperacionNoEncontradoError('CAMBIO_ESTADO'));
    }

    // 10. Actualizar el estadoId del ticket a PENDIENTE_APROBACION
    ticket.updateEstado(estadoPendiente.id);

    // 11. Crear la operación de timeline CAMBIO_ESTADO
    const operacion = OperacionTicketEntity.create({
      ticketId: ticket.id,
      tipoOperacionId,
      descripcion: null,
      estadoAnteriorId: estadoActual.id,
      estadoNuevoId: estadoPendiente.id,
      autorId: dto.autorId,
      metadata: null,
    });

    // 12. Persistir ticket actualizado + operacion en la misma transacción (atómico)
    await this.txRunner.run(async () => {
      await this.ticketRepo.save(ticket);
      await this.operacionRepo.save(operacion);
    });

    return Result.ok(ticket);
  }
}
