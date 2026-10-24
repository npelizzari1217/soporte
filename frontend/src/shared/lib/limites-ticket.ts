import { mensajeDemasiadoLargo } from "./mensaje-tope";

/**
 * Tope de largo del título de un ticket, espejando la autoridad del backend.
 *
 * La autoridad real es `TICKET_TITULO_MAX_LENGTH` en `TicketEntity`, que a su
 * vez espeja `Ticket.titulo VarChar(255)`. Acá el tope solo adelanta el
 * rechazo al formulario: un front más laxo manda al usuario a comerse un error
 * remoto por algo que se veía en pantalla.
 *
 * Vive en `shared/lib/` y no en cada feature porque **tres** formularios crean
 * tickets contra la misma columna — el de tickets, el de soporte desde equipos
 * y el edilicio desde reparaciones. Una copia por feature es exactamente la
 * divergencia que este cambio vino a cerrar del lado del backend.
 *
 * NO lo comparte `preventivo`: su `titulo` es de otra columna
 * (`planes_preventivo.titulo`) que hoy mide lo mismo por casualidad. Atarlas
 * haría que ensanchar una moviera la otra en silencio.
 */
export const TICKET_TITULO_MAX_LENGTH = 255;

/**
 * Tope de la ubicación del ticket: espejo de `TICKET_UBICACION_MAX_LENGTH` (`ticket.entity.ts`,
 * columna `tickets.ubicacion VarChar(255)`). Desde odd/ticket-unificado la ubicación es una sola,
 * la del ticket, y la escriben dos features: Tickets (alta y edición) y Edilicia (alta y edición
 * desde su pantalla). Por eso vive acá y no en cada una. Es una copia a mano: el centinela de
 * `features/edilicia/schemas.test.ts` atrapa una edición accidental, no un cambio de la columna.
 */
export const TICKET_UBICACION_MAX_LENGTH = 255;

/** Mensaje de error del tope, para que las tres features digan lo mismo. */
export const MENSAJE_TITULO_DEMASIADO_LARGO = mensajeDemasiadoLargo(
  "El título",
  TICKET_TITULO_MAX_LENGTH,
);
