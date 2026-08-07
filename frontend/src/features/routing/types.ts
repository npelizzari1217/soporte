/**
 * Tipos del routing usuario↔tipo_ticket — espejo de
 * `backend/src/tickets/domain/ports/i-usuario-tipos-ticket.repository.ts`
 * (`RoutingAsociacion`, `GET /routing`, item 5 backend-gaps — cierra el gap
 * "opera a ciegas" documentado en B4).
 */
export interface RoutingAsociacion {
  usuarioId: string;
  tipoTicketId: string;
}
