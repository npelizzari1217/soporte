/**
 * Topes de largo de los campos de edilicia, espejando la autoridad del backend.
 *
 * Autoridad: `TICKET_EDILICIA_UBICACION_MAX_LENGTH` en `TicketEdiliciaEntity` y
 * `SUBTAREA_DESCRIPCION_MAX_LENGTH` en `SubtareaEdiliciaEntity`, que espejan
 * `ticketsEdilicia.ubicacion` y `subtareasEdilicia.descripcion`, las dos
 * `VarChar(255)`. `reparaciones.dto.ts` importa esas mismas constantes, así que
 * las tres capas no pueden divergir.
 *
 * Acá el tope solo ADELANTA el rechazo al formulario. Hasta este cambio no lo
 * tenía NINGUNA capa, así que el valor llegaba a Postgres y reventaba con 22001
 * — un 500 crudo, sin nombrar el campo.
 *
 * Viven en `features/edilicia/` y no en `shared/lib/` porque estos dos campos
 * los escribe un solo módulo. El criterio es ese: una constante sube a
 * `shared/lib/` cuando MÁS DE UNA feature escribe su columna, que es el caso de
 * `limites-ticket` y de `limites-usuario`, no el de estos.
 */
export const UBICACION_MAX_LENGTH = 255;
export const SUBTAREA_DESCRIPCION_MAX_LENGTH = 255;
