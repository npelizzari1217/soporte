/**
 * Topes de largo de la identidad del usuario, espejando la autoridad del backend.
 *
 * La autoridad real es `USUARIO_NOMBRE_MAX_LENGTH` / `USUARIO_APELLIDO_MAX_LENGTH`
 * en `UsuarioEntity`, que espeja `usuarios.nombre` y `usuarios.apellido`
 * `VarChar(100)`. Los DTOs del backend importan esas mismas constantes. Acá el
 * tope solo adelanta el rechazo al formulario: un front más laxo manda al usuario
 * a comerse un error remoto por algo que se veía en pantalla, y le borra lo
 * tipeado.
 *
 * Vive en `shared/lib/` y no en `features/usuarios/` por el mismo motivo que
 * `limites-ticket.ts`: **dos formularios de features distintas escriben estas
 * columnas** — el ABM de usuarios y el alta de tenant, cuyos campos
 * `adminNombre`/`adminApellido` crean el usuario administrador inicial. Una
 * copia por feature es exactamente la divergencia que este cambio vino a cerrar:
 * hasta acá la EDICIÓN acotaba a 100 y ninguna de las dos altas lo hacía, así
 * que un nombre de 120 se podía crear y después nunca editar.
 *
 */
export const USUARIO_NOMBRE_MAX_LENGTH = 100;
export const USUARIO_APELLIDO_MAX_LENGTH = 100;

/**
 * Tope de `email`, y por qué acá SÍ hace falta aunque en el DTO no.
 *
 * `z.string().email()` NO acota el largo: es solo un regex. Medido — acepta un
 * email de 309 caracteres. `@IsEmail()` del backend sí corta, en 254
 * (`validator`, `defaultMaxEmailLength`). Sin este tope el front queda MÁS LAXO
 * que el servidor, que es justo la variante de defecto que este cambio cierra:
 * el usuario se come un 400 remoto por algo que se veía en pantalla.
 *
 * Es 254 y no 255 —el ancho de `usuarios.email`— a propósito: se espeja lo que
 * el backend REALMENTE rechaza, no la columna. El DTO no necesita declararlo
 * porque `@IsEmail()` ya lo aplica; acá no hay quien lo aplique.
 *
 * OJO al comparar capas: existe una constante HOMÓNIMA en `UsuarioEntity` que
 * vale **255**, porque ahí espeja la columna. No es una divergencia a arreglar:
 * son dos autoridades para dos preguntas distintas —qué entra en la columna, y
 * qué acepta el borde—, y el borde es el más estricto de los dos.
 */
export const USUARIO_EMAIL_MAX_LENGTH = 254;
