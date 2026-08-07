import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { SubtareaEdiliciaEntity } from '../../domain/entities/subtarea-edilicia.entity';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { UbicacionEntity } from '../../domain/entities/ubicacion.entity';
import { ISubtareaEdiliciaRepository } from '../../domain/ports/i-subtarea-edilicia.repository';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { IUbicacionRepository } from '../../domain/ports/i-ubicacion.repository';

/** Un ticket edilicio resuelto junto a su ticket base, ubicación y subtareas (para listados). */
export interface ReparacionConTicket {
  ticket: TicketEntity;
  ticketEdilicia: TicketEdiliciaEntity;
  /** `null` si la ubicación referenciada ya no se encuentra (no debería pasar en producción). */
  ubicacion: UbicacionEntity | null;
  /** Subtareas ACTIVAS del checklist (sdd/beta-frontend item 1 — G7, embebido). */
  subtareas: SubtareaEdiliciaEntity[];
}

/**
 * ListarReparacionesUseCase — caso de uso de consulta para los tickets
 * edilicios del tenant (F3-E1).
 *
 * Obtiene todos los `TicketEdiliciaEntity` activos y resuelve el `Ticket`
 * base, la `UbicacionEntity` y las subtareas de cada uno (join en memoria —
 * mismo patrón que `ListarComprasUseCase`, T4.5). Embeber subtareas (item 1,
 * G7) evita depender SOLO del cache de sesión poblado por mutaciones — antes
 * se perdía al recargar la página. Satélites sin ticket base asociado
 * (registros huérfanos, no debería pasar en producción) se omiten
 * silenciosamente.
 *
 * Tarea: T8.5.
 */
export class ListarReparacionesUseCase {
  constructor(
    private readonly ediliciaRepo: Pick<ITicketEdiliciaRepository, 'findAll'>,
    private readonly ticketRepo: Pick<ITicketRepository, 'findById'>,
    private readonly ubicacionRepo: Pick<IUbicacionRepository, 'findById'>,
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
      const ubicacion = await this.ubicacionRepo.findById(ticketEdilicia.ubicacionId);
      const subtareas = await this.subtareaRepo.findActiveByTicketEdiliciaId(ticketEdilicia.id);
      items.push({ ticket, ticketEdilicia, ubicacion, subtareas });
    }

    return Result.ok(items);
  }
}
