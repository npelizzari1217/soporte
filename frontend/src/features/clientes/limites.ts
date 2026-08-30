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
 * de clientes, que es exclusivo de ROOT. `limites-ticket.ts` está compartido
 * porque tres features distintas crean tickets contra la misma columna.
 *
 * ALCANCE: acá están los topes de los campos COMERCIALES del cliente y los de
 * la config SMTP. Los campos de admin del alta (`adminNombre`,
 * `adminApellido`, `adminEmail` en `crearClienteSchema`) siguen sin tope, igual
 * que en su DTO: escriben `usuarios.nombre`/`apellido` `VarChar(100)`, una
 * instancia todavía abierta en `AGENTS.md` que se escribe desde dos altas
 * distintas. El módulo NO quedó cerrado.
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
 * Arma el mensaje de "texto demasiado largo", para que todos los campos digan
 * lo mismo con el mismo formato.
 *
 * @param campo - Nombre del campo TAL COMO arranca la oración, con artículo y
 *   género ya resueltos: `"El nombre"`, `"La razón social"`, `"El CUIT"`. No se
 *   le antepone nada, así que un valor sin artículo produce un mensaje roto.
 * @param max - Tope de caracteres a nombrar en el mensaje.
 * @returns La oración completa, en español, lista para mostrar bajo el campo.
 */
export const mensajeDemasiadoLargo = (campo: string, max: number): string =>
  `${campo} no puede superar los ${max} caracteres`;
