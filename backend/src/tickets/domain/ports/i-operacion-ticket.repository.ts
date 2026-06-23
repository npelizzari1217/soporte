import { OperacionTicketEntity } from '../entities/operacion-ticket.entity';

/**
 * IOperacionTicketRepository — puerto de persistencia para el timeline de un ticket.
 *
 * El timeline es inmutable: solo se crea (INSERT) y se soft-deletes en casos
 * excepcionales. No hay UPDATE de operaciones.
 *
 * Ref spec: [SPEC:tickets-core/Tabla operaciones_ticket]
 * Tarea: 3.A.3
 */
export interface IOperacionTicketRepository {
  /**
   * Retorna el timeline completo de un ticket, ordenado por created_at ASC.
   * Excluye operaciones soft-deleted.
   */
  findByTicketId(ticketId: string): Promise<OperacionTicketEntity[]>;

  /**
   * Persiste una nueva operación en el timeline.
   * Solo INSERT: el timeline es inmutable.
   */
  save(operacion: OperacionTicketEntity): Promise<void>;
}

/** Token de inyección de dependencias para IOperacionTicketRepository en NestJS. */
export const OPERACION_TICKET_REPOSITORY = Symbol('OPERACION_TICKET_REPOSITORY');
