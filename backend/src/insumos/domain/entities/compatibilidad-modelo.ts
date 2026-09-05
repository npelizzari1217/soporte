/**
 * CompatibilidadModelo — el vínculo entre un insumo del catálogo y un modelo
 * de equipo al que le sirve. Es lo que permite responder "¿qué tóner le va a
 * esta impresora?".
 *
 * Es un VALUE OBJECT, no una entidad: su identidad es el PAR
 * `(insumo, modelo)` —que es la clave primaria de `insumos_modelos_equipo`—,
 * no tiene id propio, no tiene `updatedAt` ni baja lógica, y se borra con
 * cualquiera de sus dos puntas (`ON DELETE CASCADE`). Por eso NO extiende
 * `BaseEntity`: darle id y timestamps sugeriría un ciclo de vida propio que la
 * tabla no tiene.
 */
export interface CompatibilidadModelo {
  readonly modeloEquipoId: string;
  /** `null` cuando el insumo no cumple ningún rol distinguible: una lámpara no es de ningún color. */
  readonly rol: string | null;
}

/**
 * Tope de largo, espejando `insumos_modelos_equipo.rol VarChar(20)`
 * (`prisma_tenant/schema.prisma`).
 *
 * Vive ACÁ y no en el DTO porque el dominio es la autoridad del límite: el
 * `VARCHAR` de Postgres es backstop, nunca al revés. El borde lo importa de
 * este módulo para que el 400 amable y la precondición del dominio no puedan
 * divergir.
 */
export const COMPATIBILIDAD_ROL_MAX_LENGTH = 20;

/**
 * Normalización del rol: recorte de espacios, mayúscula y colapso del vacío a
 * `null`.
 *
 * El colapso es lo que impide que `''` y `NULL` convivan como dos formas de
 * decir "sin rol": la columna admite las dos, así que sin esta regla la misma
 * compatibilidad se leería distinto según por qué camino se cargó. El
 * `undefined` —el campo directamente ausente en el payload— significa lo mismo
 * que el vacío y sale por el mismo lugar.
 *
 * La columna NO tiene `CHECK` de conjunto cerrado a propósito: los colores son
 * el caso frecuente, no el único —un modelo lleva también TAMBOR, FUSOR o un
 * kit de mantenimiento—, así que acá se normaliza la forma del valor, nunca se
 * lo compara contra una lista.
 *
 * `toUpperCase()` puede AGRANDAR el string —`'ß'` se convierte en `'SS'`—, así
 * que el largo crudo no es cota del largo persistido: quien mida contra el
 * tope de la columna tiene que medir DESPUÉS de normalizar.
 *
 * @param valor Rol crudo, ausente o nulo, tal como llega del usuario.
 * @returns El rol en mayúscula sin espacios de borde, o `null` si no hay ninguno.
 */
export function normalizarRolCompatibilidad(valor: string | null | undefined): string | null {
  if (valor == null) return null;
  const normalizado = valor.trim().toUpperCase();
  return normalizado === '' ? null : normalizado;
}

/**
 * Construye el value object, normalizando el rol y validando su largo sobre el
 * resultado de esa normalización.
 *
 * Va como `throw` y no como `Result` porque un primitivo fuera de rango
 * llegando al dominio es una violación de contrato del caller, no una
 * desviación de negocio que el usuario deba ver: el borde ya lo rechaza con un
 * 400 que nombra el campo, y este es el backstop para el caller que no pasa
 * por el borde.
 *
 * @param props Modelo de equipo al que se vincula y rol crudo, ausente o nulo.
 * @returns El par listo para entrar al agregado, con el rol normalizado.
 * @throws Error si el rol ya normalizado excede el tope de su columna.
 */
export function crearCompatibilidadModelo(props: {
  modeloEquipoId: string;
  rol?: string | null;
}): CompatibilidadModelo {
  const rol = normalizarRolCompatibilidad(props.rol);
  if (rol !== null && rol.length > COMPATIBILIDAD_ROL_MAX_LENGTH) {
    throw new Error(
      `CompatibilidadModelo: rol excede ${COMPATIBILIDAD_ROL_MAX_LENGTH} caracteres.`,
    );
  }
  return { modeloEquipoId: props.modeloEquipoId, rol };
}
