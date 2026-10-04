/**
 * Topes de largo de los campos de cliente, espejando la autoridad del backend.
 *
 * Acá el tope solo ADELANTA el rechazo al formulario: un front más laxo manda
 * al usuario a comerse un error remoto por algo que se veía en pantalla, y de
 * paso le borra lo tipeado. La autoridad real vive en el backend, y en los
 * tres casos de abajo es la misma pieza: una constante exportada por
 * `ClienteEntity` que los DTOs importan en vez de repetir el número.
 *
 * Vive en `features/clientes/` y no en `shared/lib/` (donde vive
 * `limites-ticket.ts`) porque estos campos los escribe un solo módulo: el ABM
 * de clientes, que es exclusivo de ROOT. El criterio es ese y no otro: una
 * constante sube a `shared/lib/` cuando MÁS DE UNA feature escribe su columna.
 *
 * Los campos de admin del alta (`adminNombre`, `adminApellido`, `adminEmail`)
 * NO usan estos topes sino los de `shared/lib/limites-usuario`: crean el
 * usuario administrador inicial, así que escriben `usuarios.*`, no `clientes.*`.
 * Están en shared porque esas columnas las escriben dos features distintas.
 */

/**
 * Tope de `nombre`.
 *
 * Autoridad: `CLIENTE_NOMBRE_MAX_LENGTH` en `ClienteEntity`. NO es el ancho de
 * la columna —`clientes.nombre` es `VarChar(255)`— sino un tope de producto
 * más estricto; la columna queda de backstop.
 */
export const CLIENTE_NOMBRE_MAX_LENGTH = 200;

/** Ídem `nombre`: `clientes.razon_social` también es `VarChar(255)` de backstop. */
export const CLIENTE_RAZON_SOCIAL_MAX_LENGTH = 200;

/**
 * Tope de `cuit`.
 *
 * Autoridad: `CLIENTE_CUIT_MAX_LENGTH` en `ClienteEntity`, que acá sí espeja la
 * columna exacta: `clientes.cuit VARCHAR(13)`, los caracteres justos de un CUIT
 * formateado (`30-12345678-9`).
 *
 * Hasta este cambio el DTO declaraba 20 contra esa columna de 13, así que 14 a
 * 20 caracteres pasaban las dos validaciones y reventaban recién al persistir
 * (22001 → 500 crudo). Se arregló de punta a punta y no solo acá: bajar el
 * front sin tocar el backend habría tapado el síntoma en un camino dejando la
 * API abierta.
 */
export const CLIENTE_CUIT_MAX_LENGTH = 13;

/**
 * Tope de `host`, `user` y `from` de la configuración SMTP.
 *
 * Autoridad: `@MaxLength(255)` de `ConfigurarCorreoClienteDto`, que coincide
 * exacto con las columnas `smtp_host` / `smtp_user` / `smtp_from`
 * (`VarChar(255)` las tres). Su número sigue escrito a mano en el DTO en vez de
 * importarse del dominio, porque la configuración de correo no tiene entidad
 * propia con constantes que exportar.
 */
export const CLIENTE_SMTP_TEXTO_MAX_LENGTH = 255;

/**
 * Tope del slug del formulario público.
 *
 * Autoridad: `SLUG_MAX_LENGTH` de `backend/src/clientes/domain/value-objects/slug-cliente.ts`
 * (columna `clientes.slug` `VarChar(63)` y CHECK `clientes_slug_formato_check`).
 */
export const CLIENTE_SLUG_MAX_LENGTH = 63;

/** Espejo de `SLUG_REGEX` del backend (mismo archivo). Si cambia allá, cambia acá. */
export const CLIENTE_SLUG_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
