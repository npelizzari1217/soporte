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
 * Tope de `zonaHoraria` (D8, `openspec/changes/zona-horaria-por-tenant/design.md`).
 *
 * Autoridad: `ZONA_HORARIA_MAX_LENGTH` en el VO `ZonaHoraria`
 * (`backend/src/shared/domain/zona-horaria.ts`), que espeja la columna
 * `clientes.zona_horaria VARCHAR(64)` (migración
 * `20260901120000_add_cliente_zona_horaria`) con margen sobre el ID IANA
 * más largo (`America/Argentina/ComodRivadavia`, 32 caracteres).
 *
 * Cableada en `schemas.ts` (`configurarZonaHorariaSchema`, tarea 2.13) con
 * `.max()`, mismo patrón que el resto de esta lista. Es defensa en
 * profundidad y NO tiene un caso de prueba propio que la distinga de
 * `esZonaValida` (D2): ningún candidato puede pasar esa validación de
 * `Intl.DateTimeFormat` y superar 64 caracteres a la vez — todo identificador
 * IANA real y todo offset ISO soportado quedan muy por debajo. Igual que el
 * VO backend no le agrega su propio test de "cae por largo" separado del de
 * `esZonaValida`.
 */
export const CLIENTE_ZONA_HORARIA_MAX_LENGTH = 64;
