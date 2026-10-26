/**
 * Conteo de los comentarios de un ticket, separados por visibilidad: el listado suma los internos
 * solo para quien tiene `OBSERVAR` sobre el tipo del ticket, igual que el timeline.
 */
export interface ConteoComentariosTicket {
  readonly publicos: number;
  readonly internos: number;
}

/**
 * IConteoComentariosTicketRepository — conteo de los comentarios del ticket para la grilla de Edilicia.
 *
 * Desde odd/ticket-unificado (S3) los comentarios de reparación SON los comentarios del ticket
 * (operaciones `COMENTARIO` del timeline): se escriben con `IOperacionTicketRepository` y se leen
 * con el timeline. Este puerto queda con lo único que el timeline no da, el conteo por lote del
 * listado. La migración 20261024120000 copió `comentarios_reparacion` al timeline y la 20261025150000
 * (T4b) la borró.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 */
export interface IConteoComentariosTicketRepository {
  /**
   * Cuenta los comentarios activos de VARIOS tickets de una sola vez y devuelve
   * `Map<ticketId, ConteoComentariosTicket>`.
   *
   * POR LOTE A PROPÓSITO, no por conveniencia: su único consumidor es `ListarReparacionesUseCase`,
   * cuyo costo en consultas es CONSTANTE. Una firma de un solo id invitaría a llamarla dentro del
   * loop y devolvería el listado a una consulta por fila.
   *
   * Los tickets sin comentarios NO aparecen en el Map (un `GROUP BY` no emite filas vacías): quien
   * lo consuma resuelve la ausencia como `0`. Con `ticketIds` vacío no consulta nada.
   */
  contarPorTickets(ticketIds: string[]): Promise<Map<string, ConteoComentariosTicket>>;
}

/** Token de inyección de dependencias para IConteoComentariosTicketRepository en NestJS. */
export const CONTEO_COMENTARIOS_TICKET_REPOSITORY = Symbol('CONTEO_COMENTARIOS_TICKET_REPOSITORY');
