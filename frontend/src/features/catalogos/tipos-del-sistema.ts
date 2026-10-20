/**
 * Tipos de ticket FIJOS del sistema — espejo de `TIPOS_TICKET_DEL_SISTEMA`
 * (`backend/src/tickets/domain/tipos-ticket.constants.ts`). El backend los
 * protege: no se dan de baja (ni ROOT) y su código no cambia; el nombre sí.
 * Acá solo se esconde la acción y se bloquea el campo, para no ofrecer algo
 * que el backend va a rechazar con 422.
 */
export const TIPOS_TICKET_DEL_SISTEMA: readonly string[] = ["PREVENTIVO", "SOPORTE", "EDILICIA"];

export function esTipoTicketDelSistema(codigo: string): boolean {
  return TIPOS_TICKET_DEL_SISTEMA.includes(codigo);
}

/**
 * Módulos cuyas altas permiten elegir el tipo de ticket — espejo de `MODULOS_CON_ALTA_DE_TIPO`
 * (`backend/src/tickets/domain/tipos-ticket.constants.ts`). Un tipo de otro módulo no se podría
 * usar, así que el ABM solo ofrece estos (odd/tasks/tipos-ticket-por-modulo.md, S4).
 */
export const MODULOS_CON_ALTA_DE_TIPO: readonly string[] = ["TICKETS", "EDILICIA"];
