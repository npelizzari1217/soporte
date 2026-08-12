import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { SubtareaEdiliciaEntity } from '../../domain/entities/subtarea-edilicia.entity';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { ISubtareaEdiliciaRepository } from '../../domain/ports/i-subtarea-edilicia.repository';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';

/** Un ticket edilicio resuelto junto a su ticket base y subtareas (para listados). */
export interface ReparacionConTicket {
  ticket: TicketEntity;
  ticketEdilicia: TicketEdiliciaEntity;
  /** Subtareas ACTIVAS del checklist (sdd/beta-frontend item 1 — G7, embebido). */
  subtareas: SubtareaEdiliciaEntity[];
}

/**
 * ListarReparacionesUseCase — caso de uso de consulta para los tickets
 * edilicios del tenant (F3-E1).
 *
 * Obtiene todos los `TicketEdiliciaEntity` activos y resuelve el `Ticket`
 * base y las subtareas de cada uno (join en memoria — mismo patrón que
 * `ListarComprasUseCase`, T4.5). `ubicacion` viaja embebida como texto libre
 * en el propio `TicketEdiliciaEntity` (ex-catálogo Ubicacion removido — no
 * requiere resolución aparte). Embeber subtareas (item 1, G7) evita depender
 * SOLO del cache de sesión poblado por mutaciones — antes se perdía al
 * recargar la página. Satélites sin ticket base asociado (registros
 * huérfanos, no debería pasar en producción) se omiten silenciosamente.
 *
 * Tarea: T8.5.
 */
export class ListarReparacionesUseCase {
  constructor(
    private readonly ediliciaRepo: Pick<ITicketEdiliciaRepository, 'findAll'>,
    private readonly ticketRepo: Pick<ITicketRepository, 'findById'>,
    private readonly subtareaRepo: Pick<
      ISubtareaEdiliciaRepository,
      'findActiveByTicketEdiliciaId'
    >,
  ) {}

  async execute(): Promise<Result<ReparacionConTicket[], DomainError>> {
    const satelites = await this.ediliciaRepo.findAll();
    const items: ReparacionConTicket[] = [];

    for (const ticketEdilicia of satelites) {
      const ticket = await this.ticketRepo.findById(ticketEdilicia.ticketId);
      if (!ticket) {
        continue;
      }
      const subtareas = await this.subtareaRepo.findActiveByTicketEdiliciaId(ticketEdilicia.id);
      items.push({ ticket, ticketEdilicia, subtareas });
    }

    return Result.ok(items);
  }
}
