/**
 * Consulta de bloqueo por compra de un ticket (odd/ticket-cerrado-solo-lectura, S2).
 *
 * Un ticket está bloqueado si tiene al menos una compra vinculada en el grupo `ACTIVAS`
 * (sdd/reparacion-bloqueada-por-compra). Desde odd/ticket-unificado (S5) el vínculo es del ticket,
 * de cualquier tipo. Vive como puerto de este módulo porque la regla frena las tareas acá; la
 * implementación reutiliza el criterio de reparaciones, no lo duplica.
 */
export interface IBloqueoTicketRepository {
  /**
   * `true` si el ticket tiene una compra vinculada activa. Un ticket sin compras vinculadas, o con
   * compras solo completadas o canceladas, nunca está bloqueado.
   */
  estaBloqueadoPorCompra(ticketId: string): Promise<boolean>;

  /**
   * Números de las compras vinculadas al ticket, en cualquier estado, salvo las dadas de baja
   * (odd/permisos-por-tipo-ticket, S8: frenan el borrado del ticket). Vacío si el ticket no tiene
   * compras vinculadas.
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
