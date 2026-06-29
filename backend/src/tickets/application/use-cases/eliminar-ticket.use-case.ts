import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import {
  EstadoCatalogoNoEncontradoError,
  TicketNoBorrableError,
  TicketNoEncontradoError,
  TipoOperacionNoEncontradoError,
} from '../../domain/errors/tickets.errors';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';

/**
 * DTO de entrada para dar de baja lógica (soft-delete) un ticket.
 *
 * - `ticketId`: UUID del ticket a eliminar.
 * - `autorId`: UUID del usuario que realiza la acción (del JWT). Se registra
 *   en la OperacionTicket de auditoría.
 */
export interface EliminarTicketDto {
  ticketId: string;
  autorId: string;
}

/**
 * EliminarTicketUseCase — da de baja lógica (soft-delete) un ticket.
 *
 * Flujo (actualizado ADR-3 — bloqueo por estado):
 * 1. Cargar el ticket por id. Si !ticket → TicketNoEncontradoError (404).
 *    Incluye tickets de otro tenant (aislamiento físico → null).
 * 2. Si ticket.isDeleted() → Result.ok(ticket) NO-OP idempotente (locked decision L2).
 *    NO se registra una segunda OperacionTicket ELIMINACION; NO se abre transacción.
 * 3. Cargar el estado actual del ticket via IEstadoRepository.
 *    Si null → EstadoCatalogoNoEncontradoError (500 — corrupción de catálogo).
 * 4. Validar ticket.canDelete(estado.codigo).
 *    Si false → TicketNoBorrableError (422 — solo ABIERTO puede eliminarse, ADR-3).
 * 5. Resolver tipoOperacionId para 'ELIMINACION'. Si null → TipoOperacionNoEncontradoError (500).
 * 6. ticket.softDelete() — marca la entidad como borrada.
 * 7. Construir OperacionTicketEntity ELIMINACION con metadata: null.
 * 8. txRunner.run(() => ticketRepo.save(ticket) + operacionRepo.save(operacion)) — atómico.
 * 9. Result.ok(ticket).
 *
 * Ref spec: tickets-core §"Soft delete exitoso de ticket activo"
 * Ref spec: Req "Bloqueo de borrado por estado" (tickets-core/spec.md), ADR-3
 * Change: tickets-maquina-estados-observaciones / PR1
 */
export class EliminarTicketUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
    private readonly estadoRepo: IEstadoRepository,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: EliminarTicketDto): Promise<Result<TicketEntity, DomainError>> {
    // 1. Cargar el ticket (incluye soft-deleted — findById no filtra por deletedAt)
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (!ticket) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }

    // 2. Idempotencia: si ya está borrado, devolver ok sin modificar nada (L2)
    if (ticket.isDeleted()) {
      return Result.ok(ticket);
    }

    // 3. Cargar estado actual del ticket (necesario para validar canDelete)
    const estado = await this.estadoRepo.findById(ticket.estadoId);
    if (!estado) {
      return Result.fail(new EstadoCatalogoNoEncontradoError(ticket.estadoId));
    }

    // 4. Validar que el ticket esté en estado ABIERTO para poder eliminarse (ADR-3)
    if (!ticket.canDelete(estado.codigo)) {
      return Result.fail(new TicketNoBorrableError(estado.codigo));
    }

    // 5. Resolver el id del tipo de operación ELIMINACION
    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('ELIMINACION');
    if (!tipoOperacionId) {
      return Result.fail(new TipoOperacionNoEncontradoError('ELIMINACION'));
    }

    // 6. Marcar la entidad como soft-deleted
    ticket.softDelete();

    // 7. Crear la OperacionTicket ELIMINACION (mínima, igual que ASIGNACION)
    const operacion = OperacionTicketEntity.create({
      ticketId: ticket.id,
      tipoOperacionId,
      descripcion: null,
      estadoAnteriorId: null,
      estadoNuevoId: null,
      autorId: dto.autorId,
      metadata: null,
    });

    // 8. Persistir ticket soft-deleted + operacion en la misma transacción (atómico)
    await this.txRunner.run(async () => {
      await this.ticketRepo.save(ticket);
      await this.operacionRepo.save(operacion);
    });

    return Result.ok(ticket);
  }
}
