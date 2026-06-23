import { TicketEdiliciaEntity } from '../entities/ticket-edilicia.entity';

/**
 * ITicketEdiliciaRepository — puerto de persistencia para el satélite ticket_edilicia.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La implementación concreta vive en infrastructure/persistence/prisma/.
 * El repositorio opera dentro del tenant activo (client desde TenantContext).
 *
 * Ref spec: [SPEC:reparaciones/Tabla ticket_edilicia, Satélite obligatorio]
 * Tarea: 5.A.5
 */
export interface ITicketEdiliciaRepository {
  /**
   * Busca el ticket_edilicia asociado a un ticket base.
   * Retorna null si no existe (ticket no es de tipo EDILICIA o no fue creado).
   */
  findByTicketId(ticketId: string): Promise<TicketEdiliciaEntity | null>;

  /**
   * Busca el ticket_edilicia por su identificador técnico.
   * Retorna null si no existe.
   */
  findById(id: string): Promise<TicketEdiliciaEntity | null>;

  /**
   * Persiste el ticket_edilicia (upsert: crea si no existe, actualiza si existe).
   *
   * La actualización del porcentaje de avance se realiza en la misma llamada
   * que la creación/completitud de subtareas (dentro del mismo txRunner.run()).
   */
  save(ticketEdilicia: TicketEdiliciaEntity): Promise<void>;

  /**
   * Baja lógica del satélite (soft delete coherente con el ticket base).
   * NO elimina la fila — setea deleted_at.
   * Las subtareas permanecen con sus valores actuales (no se eliminan en cascada).
   */
  delete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para ITicketEdiliciaRepository en NestJS. */
export const TICKET_EDILICIA_REPOSITORY = Symbol('TICKET_EDILICIA_REPOSITORY');
