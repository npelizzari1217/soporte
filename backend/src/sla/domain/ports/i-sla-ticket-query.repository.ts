/** Fila mínima de ticket vencible retornada por `findVencibles` (S4, sin PII de contacto). */
export interface TicketVencible {
  id: string;
  asignadoId: string | null;
  solicitanteId: string | null;
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
   * no soft-deleted, sin `sla_reloj_pendiente` y con el reloj corriendo
   * (`estado.codigo` en `ESTADOS_RELOJ_CORRE`: excluye espera, RESUELTO,
   * CERRADO y CANCELADO).
   */
  findVencibles(now: Date): Promise<TicketVencible[]>;

  /**
   * Marca `vencido=true` en el ticket indicado. Idempotente: el `WHERE
   * vencido=false` vive en la implementación — un ticket ya marcado no se
   * re-marca (S4). Devuelve `true` solo si esta llamada afectó la fila: es
   * lo que habilita publicar `sla.vencido` una sola vez.
   */
  marcarVencido(ticketId: string): Promise<boolean>;

  /**
   * Tickets con la primera respuesta vencida y todavía sin marcar (`sla-primera-respuesta` R4):
   * `primeraRespuestaVenceAt < now`, `primeraRespuestaAt` y `deletedAt` nulos,
   * `primeraRespuestaVencida=false` y estado fuera de RESUELTO, CERRADO y CANCELADO. NO excluye la
   * espera ni mira el reloj pendiente: la primera respuesta no tiene pausa.
   */
  findPrimerasRespuestasVencidas(now: Date): Promise<TicketVencible[]>;

  /**
   * Marca `primeraRespuestaVencida=true` con un CAS sobre `false` (y `primeraRespuestaAt` nulo).
   * Devuelve `true` solo si esta llamada afectó la fila: habilita publicar el evento una sola vez.
   */
  marcarPrimeraRespuestaVencida(ticketId: string): Promise<boolean>;
}

/** Token de inyección de dependencias para ISlaTicketQueryRepository en NestJS. */
export const SLA_TICKET_QUERY_REPOSITORY = Symbol('SLA_TICKET_QUERY_REPOSITORY');
