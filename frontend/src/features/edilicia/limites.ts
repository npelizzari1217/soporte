/**
 * Tope de largo de la ubicación de una reparación, espejando la autoridad del
 * backend: `TICKET_EDILICIA_UBICACION_MAX_LENGTH` en `TicketEdiliciaEntity`, que
 * espeja `ticketsEdilicia.ubicacion` (`VarChar(255)`), y `reparaciones.dto.ts`
 * importa esa misma constante.
 *
 * OJO con el alcance: entidad y DTO están unidas por un `import`, así que ESAS
 * dos no pueden divergir. Este número es una copia a mano, fijada por el
 * centinela del test — que atrapa una edición accidental, no un cambio de la
 * columna.
 *
 * Acá el tope solo ADELANTA el rechazo al formulario. Hasta este cambio no lo
 * tenía NINGUNA capa, así que el valor llegaba a Postgres y reventaba con 22001
 * — un 500 crudo, sin nombrar el campo.
 *
 * Vive en `features/edilicia/` y no en `shared/lib/` porque este campo lo
 * escribe un solo módulo. El criterio es ese: una constante sube a
 * `shared/lib/` cuando MÁS DE UNA feature escribe su columna, que es el caso de
 * `limites-ticket` y de `limites-usuario`, no el de este. La descripción de una
 * tarea (antes subtarea) se valida con `crearTareaSchema` de `features/tickets`
 * (odd/tareas-con-tecnico, T6).
 */
export const UBICACION_MAX_LENGTH = 255;
