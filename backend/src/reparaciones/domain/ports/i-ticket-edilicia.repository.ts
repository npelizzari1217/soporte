import { TicketEdiliciaEntity } from '../entities/ticket-edilicia.entity';

/**
 * ITicketEdiliciaRepository — puerto de persistencia para el satélite
 * `ticket_edilicia` (1:0..1 con `Ticket`).
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS. La
 * implementación concreta (`PrismaTicketEdiliciaRepository`, PR7) obtiene su
 * cliente vía `TenantContext.getClient()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E1, F3-E3, F3-E4. Ref design:
 * "Firmas TS clave" (ports/*). Tarea: T6.6.
 */
export interface ITicketEdiliciaRepository {
  /**
   * Busca el `ticket_edilicia` asociado a un ticket base.
   * Retorna `null` si no existe (el ticket no es de tipo EDILICIA, o el
   * satélite aún no fue creado).
   */
  findByTicketId(ticketId: string): Promise<TicketEdiliciaEntity | null>;

  /**
   * Busca el `ticket_edilicia` por su identificador técnico (UUIDv7).
   * Retorna `null` si no existe. Incluye registros soft-deleted.
   */
  findById(id: string): Promise<TicketEdiliciaEntity | null>;

  /**
   * Retorna todos los `ticket_edilicia` del tenant activo, ordenados por
   * `created_at DESC`. Excluye soft-deleted.
   */
  findAll(): Promise<TicketEdiliciaEntity[]>;

  /**
   * Persiste el `ticket_edilicia` (upsert: crea si no existe, actualiza si
   * existe). El repositorio decide INSERT vs UPDATE según el id.
   */
  save(ticketEdilicia: TicketEdiliciaEntity): Promise<void>;
}

/** Token de inyección de dependencias para ITicketEdiliciaRepository en NestJS. */
export const TICKET_EDILICIA_REPOSITORY = Symbol('TICKET_EDILICIA_REPOSITORY');
