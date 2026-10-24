import { TICKET_UBICACION_MAX_LENGTH } from "@/shared/lib/limites-ticket";

/**
 * Tope de largo de la ubicación que se carga desde Edilicia. Desde odd/ticket-unificado (L11) es la
 * ubicación del ticket (`tickets.ubicacion`, `VarChar(255)`), la única: el backend la valida con
 * `TICKET_UBICACION_MAX_LENGTH` de `TicketEntity`, que `reparaciones.dto.ts` importa. Por eso este
 * tope ya no es una copia propia: es el mismo de `shared/lib/limites-ticket`, que también usan los
 * formularios de Tickets, y no pueden divergir.
 *
 * Acá el tope solo ADELANTA el rechazo al formulario: sin él, el valor llegaba a Postgres y
 * reventaba con 22001 — un 500 crudo, sin nombrar el campo. La descripción de una tarea (antes
 * subtarea) se valida con `crearTareaSchema` de `features/tickets` (odd/tareas-con-tecnico, T6).
 */
export const UBICACION_MAX_LENGTH = TICKET_UBICACION_MAX_LENGTH;
