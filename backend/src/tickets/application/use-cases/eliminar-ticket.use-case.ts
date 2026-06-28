import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import {
  TicketNoEncontradoError,
  TipoOperacionNoEncontradoError,
} from '../../domain/errors/tickets.errors';
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
 * Flujo:
 * 1. Cargar el ticket por id. Si !ticket → TicketNoEncontradoError (404).
 *    Incluye tickets de otro tenant (aislamiento físico → null).
 * 2. Si ticket.isDeleted() → Result.ok(ticket) NO-OP idempotente (locked decision L2).
 *    NO se registra una segunda OperacionTicket ELIMINACION; NO se abre transacción.
 * 3. Resolver tipoOperacionId para 'ELIMINACION'. Si null → TipoOperacionNoEncontradoError (500).
 * 4. ticket.softDelete() — marca la entidad como borrada.
 * 5. Construir OperacionTicketEntity ELIMINACION con metadata: null.
 * 6. txRunner.run(() => ticketRepo.save(ticket) + operacionRepo.save(operacion)) — atómico.
 *    Se usa save(ticket) con deletedAt ya seteado; no repo.delete(id), para mantener
 *    ticket + operación en una sola transacción atómica, igual que el resto de use cases.
 * 7. Result.ok(ticket).
 *
 * NOTA: NO carga el estado (no llama estadoRepo.findById).
 * El borrado está PERMITIDO en estados terminales (CERRADO/CANCELADO).
 * Esto lo diferencia de EditarTicketUseCase que requiere canEdit().
 *
 * Ref spec: tickets-core §"Soft delete exitoso de ticket activo"
 * Ref spec: tickets-editar-borrar locked decision L2, L3
 * Tarea: S3-T2
 */
export class EliminarTicketUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
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

    // 3. Resolver el id del tipo de operación ELIMINACION
    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('ELIMINACION');
    if (!tipoOperacionId) {
      return Result.fail(new TipoOperacionNoEncontradoError('ELIMINACION'));
    }

    // 4. Marcar la entidad como soft-deleted
    ticket.softDelete();

    // 5. Crear la OperacionTicket ELIMINACION (mínima, igual que ASIGNACION)
    const operacion = OperacionTicketEntity.create({
      ticketId: ticket.id,
      tipoOperacionId,
      descripcion: null,
      estadoAnteriorId: null,
      estadoNuevoId: null,
      autorId: dto.autorId,
      metadata: null,
    });

    // 6. Persistir ticket soft-deleted + operacion en la misma transacción (atómico)
    await this.txRunner.run(async () => {
      await this.ticketRepo.save(ticket);
      await this.operacionRepo.save(operacion);
    });

    return Result.ok(ticket);
  }
}
