import { TicketSoporteEntity } from '../entities/ticket-soporte.entity';

/**
 * ITicketSoporteRepository — puerto de persistencia para el satélite
 * `ticket_soporte` (1:0..1 con `Ticket`, F3-Q4/F3-Q5).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q4, F3-Q5. Ref design: "Firmas
 * TS clave" (ports/*). Tarea: T10.6.
 */
export interface ITicketSoporteRepository {
  /** Busca el `ticket_soporte` por su identificador técnico. */
  findById(id: string): Promise<TicketSoporteEntity | null>;

  /** Busca el `ticket_soporte` asociado a un ticket base. */
  findByTicketId(ticketId: string): Promise<TicketSoporteEntity | null>;

  /** Retorna los `ticket_soporte` vinculados a un equipo (histórico de incidencias). */
  findByEquipoId(equipoId: string): Promise<TicketSoporteEntity[]>;

  /** Persiste el `ticket_soporte` (upsert). */
  save(ticketSoporte: TicketSoporteEntity): Promise<void>;
}

/** Token de inyección de dependencias para ITicketSoporteRepository en NestJS. */
export const TICKET_SOPORTE_REPOSITORY = Symbol('TICKET_SOPORTE_REPOSITORY');
