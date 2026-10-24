/**
 * Consulta de bloqueo por compra de un ticket (odd/ticket-cerrado-solo-lectura, S2).
 *
 * El bloqueo es un concepto de Edilicia (sdd/reparacion-bloqueada-por-compra): una
 * reparación con al menos una compra vinculada en el grupo `ACTIVAS`. Vive como puerto de
 * este módulo porque las tareas son de cualquier ticket y la regla las frena acá; la
 * implementación reutiliza el criterio de reparaciones, no lo duplica.
 */
export interface IBloqueoTicketRepository {
  /**
   * `true` si el ticket tiene una reparación bloqueada por una compra activa. Un ticket sin
   * reparación, o con compras solo completadas o canceladas, nunca está bloqueado.
   */
  estaBloqueadoPorCompra(ticketId: string): Promise<boolean>;

  /**
   * Números de las compras vinculadas a la reparación del ticket, en cualquier estado, salvo las
   * dadas de baja (odd/permisos-por-tipo-ticket, S8: frenan el borrado del ticket). Vacío si el
   * ticket no tiene reparación o no tiene compras vinculadas.
   */
  comprasVinculadas(ticketId: string): Promise<string[]>;

  /**
   * `true` si el ticket lo generó el barrido a partir de un plan preventivo: tiene una fila en
   * `preventivo_generacion` (odd/preventivo-por-tipo). Es lo que lo vuelve no borrable, sea del
   * tipo que sea: el plan elige el tipo de sus tickets.
   */
  generadoPorPlanPreventivo(ticketId: string): Promise<boolean>;
}

export const BLOQUEO_TICKET_REPOSITORY = Symbol('BLOQUEO_TICKET_REPOSITORY');
