import { DomainError, Result } from '../../../shared/domain/result';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';

/**
 * ListarOperacionesUseCase — caso de uso de consulta para el timeline de un ticket.
 *
 * CRITICAL-2 fix: verifica existencia del ticket antes de listar operaciones.
 * Sin esta verificación, un UUID inexistente retornaba 200 [] en lugar de 404.
 *
 * Flujo:
 * 1. Verifica que el ticket exista y no esté soft-deleted via ITicketRepository.findById().
 *    → Result.fail(TicketNoEncontradoError) si no existe o está borrado.
 * 2. Lista las operaciones via IOperacionTicketRepository.findByTicketId().
 *
 * Retorna lista vacía si el ticket existe pero no tiene operaciones registradas.
 * El orden es cronológico ASC (definido por el repositorio).
 *
 * Ref spec: [SPEC:tickets-core/Tabla operaciones_ticket]
 * Tarea: 3.E.2 + fix CRITICAL-2 verify PR-11
 */
export class ListarOperacionesUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
  ) {}

  async execute(ticketId: string): Promise<Result<OperacionTicketEntity[], DomainError>> {
    // 1. Verificar que el ticket existe y no está soft-deleted.
    //    findById retorna soft-deleted también — el caller (este use case) debe filtrarlos.
    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket || ticket.isDeleted()) {
      return Result.fail(new TicketNoEncontradoError(ticketId));
    }

    // 2. Listar operaciones del ticket
    const operaciones = await this.operacionRepo.findByTicketId(ticketId);
    return Result.ok(operaciones);
  }
}
