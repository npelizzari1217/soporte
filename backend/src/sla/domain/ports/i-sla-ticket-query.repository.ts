/** Fila mínima de ticket vencible retornada por `findVencibles` (S4, sin PII de contacto). */
export interface TicketVencible {
  id: string;
  asignadoId: string | null;
  solicitanteId: string;
}

/**
 * ISlaTicketQueryRepository — puerto de lectura/marcado del módulo SLA sobre
 * `tickets` (S4). Acotado a las columnas SLA (ADR-P4) — NO pasa por
 * `ITicketRepository`.
 *
 * Ref spec: sdd/premium/spec S4. Ref design: ADR-P4. Tarea: SB1/SB2.
 */
export interface ISlaTicketQueryRepository {
  /**
   * Retorna los tickets vencibles: `sla_vence_at < now`, `vencido=false`,
   * no soft-deleted, y en estado NO terminal (excluye
   * RESUELTO/CERRADO/CANCELADO, S4).
   */
  findVencibles(now: Date): Promise<TicketVencible[]>;

  /**
   * Marca `vencido=true` en el ticket indicado. Idempotente: el `WHERE
   * vencido=false` (o equivalente) vive en la implementación — un ticket ya
   * marcado no se re-marca (S4).
   */
  marcarVencido(ticketId: string): Promise<void>;
}

/** Token de inyección de dependencias para ISlaTicketQueryRepository en NestJS. */
export const SLA_TICKET_QUERY_REPOSITORY = Symbol('SLA_TICKET_QUERY_REPOSITORY');
