/**
 * Topes de largo del catálogo de tipos de componente, espejando la autoridad
 * del backend.
 *
 * Autoridad: `TIPO_COMPONENTE_CODIGO_MAX_LENGTH` y
 * `TIPO_COMPONENTE_NOMBRE_MAX_LENGTH` en `TipoComponente`, que espejan
 * `tiposComponente.codigo VarChar(50)` y `nombre VarChar(100)`.
 * `tipos-componente.dto.ts` importa esas mismas constantes.
 *
 * Viven en la feature y no en `shared/lib/` porque estos campos los escribe un
 * solo módulo: el ABM del catálogo.
 */
export const TIPO_COMPONENTE_CODIGO_MAX_LENGTH = 50;
export const TIPO_COMPONENTE_NOMBRE_MAX_LENGTH = 100;

/**
 * Normalización de `codigo`, espejo exacto de `normalizarCodigoTipoComponente`
 * del backend.
 *
 * Existe acá porque el tope hay que medirlo sobre el valor NORMALIZADO, no
 * sobre lo tipeado: `toUpperCase()` puede agrandar el string (`'ß'` → `'SS'`),
 * así que 50 caracteres tipeados pueden ser 100 al guardarse. Si el front
 * midiera el crudo, aceptaría valores que el backend rechaza — el mismo tipo de
 * desalineación que estos topes vienen a cerrar.
 *
 * @param valor - Lo que el usuario tipeó en el campo.
 * @returns El código tal como va a persistirse.
 */
export const normalizarCodigo = (valor: string): string => valor.trim().toUpperCase();
