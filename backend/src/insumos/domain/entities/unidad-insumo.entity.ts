/**
 * Catálogos y normalización de las unidades por número de serie
 * (sdd/repuestos-numero-de-serie, ADR-1 y ADR-9). Por ahora solo constantes y
 * función: la entidad completa llega en WU-2.
 *
 * Cada catálogo es la ÚNICA fuente de verdad del CHECK homónimo de la base, y
 * `unidades-insumo-constraints.integration.spec.ts` lo compara contra la
 * definición real con `pg_get_constraintdef`. Agregar un valor acá sin su
 * migración hace que el INSERT lo rechace el CHECK, y sin filtro global de
 * excepciones eso sale como 500.
 */

/** Modo de seguimiento de un insumo: por cantidad (hoy) o una unidad por pieza. */
export const SEGUIMIENTOS_INSUMO = ['NINGUNO', 'SERIE'] as const;

/** Seguimiento de un insumo, derivado de `SEGUIMIENTOS_INSUMO`. */
export type SeguimientoInsumo = (typeof SEGUIMIENTOS_INSUMO)[number];

/** Estados de una unidad. Ninguno es terminal (ver la máquina de estados del diseño, ADR-1). */
export const ESTADOS_UNIDAD_INSUMO = [
  'EN_DEPOSITO',
  'INSTALADA',
  'ENTREGADA',
  'DESCARTADA',
] as const;

/** Estado de una unidad, derivado de `ESTADOS_UNIDAD_INSUMO`. */
export type EstadoUnidadInsumo = (typeof ESTADOS_UNIDAD_INSUMO)[number];

/** Tipos de evento de la bitácora `eventos_unidad_insumo` (ADR-9). */
export const TIPOS_EVENTO_UNIDAD = [
  'INGRESO',
  'ALTA_INSTALADA',
  'SERIAL_CARGADO',
  'CORRECCION_SERIAL',
  'INSTALACION',
  'RETIRO_A_DEPOSITO',
  'DESCARTE',
  'ENTREGA',
  'DEVOLUCION_DE_ENTREGA',
  'BAJA_DE_DEPOSITO',
  'RECUPERACION',
  'REACTIVACION',
] as const;

/** Tipo de evento de una unidad, derivado de `TIPOS_EVENTO_UNIDAD`. */
export type TipoEventoUnidad = (typeof TIPOS_EVENTO_UNIDAD)[number];

/**
 * Largo máximo del número de serie cargado: el `VarChar(255)` de
 * `unidades_insumo.numero_serie` (y de `componentes_equipo.numero_serie`).
 * El dominio es la autoridad; la columna es backstop.
 */
export const UNIDAD_SERIAL_MAX_LENGTH = 255;

/**
 * Forma normalizada de un número de serie, sobre la que se compara la unicidad
 * por insumo: sin espacios (ni los de los bordes ni los internos) y en
 * mayúsculas. Es la ÚNICA normalización del sistema: la base solo compara la
 * columna `numero_serie_normalizado`, porque `toUpperCase()` de JS y `upper()`
 * de Postgres difieren fuera de ASCII.
 *
 * `ß` pasa a `SS` (semántica de `String.prototype.toUpperCase`), así que la
 * forma normalizada puede ser más larga que la cargada.
 *
 * @param serial Serial tal como lo cargó el usuario.
 * @returns La forma normalizada, o `''` si no quedó ningún carácter: el
 *   llamador trata el vacío como serie pendiente y nunca lo persiste.
 */
export function normalizarSerial(serial: string): string {
  return serial.replace(/\s+/g, '').toUpperCase();
}
