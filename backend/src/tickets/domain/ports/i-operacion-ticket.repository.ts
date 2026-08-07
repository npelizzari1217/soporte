import { OperacionTicketEntity } from '../entities/operacion-ticket.entity';

/**
 * IOperacionTicketRepository — puerto de persistencia para el timeline de
 * un ticket.
 *
 * El timeline es inmutable: solo se crea (INSERT) y se soft-deletes en
 * casos excepcionales de auditoría/corrección — no hay UPDATE de
 * operaciones (spec T12, T24).
 *
 * `listByTicket` es la fuente de `ListarTimelineUseCase` (PR9, T18): el
 * filtro de visibilidad de `esInterno` NO se aplica acá (el repo retorna
 * todo el timeline) — lo aplica el use case según el permiso del actor.
 *
 * Ref spec: sdd/tickets-core/spec T12, T18, T24. Ref design: "Archivos
 * afectados" (PR5 — `listByTicket`). Tarea: T3.7.
 */
export interface IOperacionTicketRepository {
  /**
   * Retorna el timeline completo de un ticket (públicas + internas),
   * ordenado por `created_at ASC`. Excluye operaciones soft-deleted.
   */
  listByTicket(ticketId: string): Promise<OperacionTicketEntity[]>;

  /**
   * Busca una operación por su id (incluye soft-deleted — mismo criterio
   * que `ITicketRepository.findById`; el caller decide qué hacer con
   * `isDeleted()`). Retorna `null` si no existe.
   *
   * Deviación de PR10 (mismo patrón que las extensiones `findById` de
   * PR6/PR7 sobre `ITipoTicketRepository`/`IPrioridadRepository`/
   * `IEstadoRepository`): `AdjuntarArchivoUseCase` (T22) necesita resolver
   * el `ticketId` dueño de una operación para el endpoint
   * `POST /operaciones/:id/adjuntos` (la URL solo trae el `operacionId`).
   */
  findById(id: string): Promise<OperacionTicketEntity | null>;

  /**
   * Persiste una nueva operación en el timeline. Solo INSERT: el timeline
   * es inmutable.
   */
  save(operacion: OperacionTicketEntity): Promise<void>;
}

/** Token de inyección de dependencias para IOperacionTicketRepository en NestJS. */
export const OPERACION_TICKET_REPOSITORY = Symbol('OPERACION_TICKET_REPOSITORY');
