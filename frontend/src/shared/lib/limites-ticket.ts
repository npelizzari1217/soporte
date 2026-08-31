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

/** Mensaje de error del tope, para que las tres features digan lo mismo. */
export const MENSAJE_TITULO_DEMASIADO_LARGO = mensajeDemasiadoLargo(
  "El título",
  TICKET_TITULO_MAX_LENGTH,
);
