/**
 * ISlaTicketWriteRepository — puerto de escritura ACOTADO del módulo SLA
 * sobre las columnas `tickets.sla_vence_at` (el schema declara al módulo SLA
 * dueño de esa columna — ADR-P4). NO pasa por `ITicketRepository` (Fase 2):
 * el bounded context de escritura del módulo SLA está limitado a esta única
 * columna, sin acceso al resto del agregado Ticket.
 *
 * Ref spec: sdd/premium/spec S2, S3. Ref design: ADR-P4. Tarea: SA13.
 */
export interface ISlaTicketWriteRepository {
  /**
   * Setea `sla_vence_at` de un ticket. `null` = sin SLA aplicable (prioridad
   * sin config activa, S2).
   */
  setSlaVenceAt(ticketId: string, venceAt: Date | null): Promise<void>;
}

/** Token de inyección de dependencias para ISlaTicketWriteRepository en NestJS. */
export const SLA_TICKET_WRITE_REPOSITORY = Symbol('SLA_TICKET_WRITE_REPOSITORY');
