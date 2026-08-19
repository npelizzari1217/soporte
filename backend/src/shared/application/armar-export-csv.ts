import { DomainError, Result } from '../domain/result';
import { desplazarAArgentina } from '../domain/zona-horaria-argentina';
import { ColumnaCsv, serializarCsv } from '../infrastructure/csv/csv';

/**
 * Entrada de {@link armarExportCsv}: todo lo que un caso de uso de
 * exportación necesita aportar — filas ya resueltas, el total real (no el
 * largo del array, que puede venir recortado por paginación), el tope
 * aplicable y la fábrica de SU PROPIO error de dominio.
 */
export interface ArmarExportCsvInput<T> {
  /** Filas a exportar, ya mapeadas a las columnas del archivo. */
  filas: readonly T[];
  /**
   * Total real de filas que matchean el filtro, no `filas.length`. Un caso
   * de uso puede pedir como mucho `tope` filas al repositorio; sin el total
   * real (de un `count()`), un resultado recortado a `tope` parecería
   * completo cuando en realidad se truncó en silencio.
   */
  total: number;
  /** Máximo de filas permitido para esta exportación. */
  tope: number;
  /** Columnas del archivo, en el orden en que deben aparecer. */
  columnas: readonly ColumnaCsv<T>[];
  /** Prefijo del nombre de archivo, p. ej. `"compras"` → `compras-2026-08-19.csv`. */
  prefijo: string;
  /**
   * Fábrica del error de dominio a devolver cuando `total` supera `tope`.
   *
   * Este helper NUNCA construye el error él mismo: cada módulo mantiene su
   * propia clase de error, porque los specs de controller derivan su
   * catálogo de errores por reflexión sobre las clases del PROPIO módulo —
   * una clase de error compartida quedaría fuera de esa reflexión y la
   * garantía de "todo error nuevo se mapea a un status HTTP" dejaría de
   * cubrir la exportación en silencio.
   */
  alExceder: (total: number, tope: number) => DomainError;
}

/** Archivo listo para que el controller lo entregue como descarga. */
export interface ArmarExportCsvResult {
  /** CSV completo, con BOM y encabezado. */
  contenido: string;
  /** Nombre sugerido, con la fecha de exportación en hora de Argentina. */
  nombreArchivo: string;
}

/**
 * armarExportCsv — helper compartido por las exportaciones de todos los
 * módulos: valida el tope de filas, serializa el CSV y arma el nombre de
 * archivo con fecha de Argentina.
 *
 * Por qué una función libre y no una clase base: los casos de uso que la
 * consumen tienen grafos de dependencias y firmas de consulta incompatibles
 * entre sí — una clase base obligaría a todos a encajar en una forma común
 * a cambio de ahorrar unas pocas líneas. Lo que sí se comparte es política
 * (el tope, el sufijo de fecha, "nunca truncar en silencio"), y eso es
 * exactamente lo que esta función centraliza.
 *
 * @param input Ver {@link ArmarExportCsvInput}.
 */
export function armarExportCsv<T>(
  input: ArmarExportCsvInput<T>,
): Result<ArmarExportCsvResult, DomainError> {
  const { filas, total, tope, columnas, prefijo, alExceder } = input;

  if (total > tope) {
    return Result.fail(alExceder(total, tope));
  }

  return Result.ok({
    contenido: serializarCsv(filas, columnas),
    nombreArchivo: `${prefijo}-${sufijoFechaArgentina()}.csv`,
  });
}

/**
 * Sufijo `aaaa-mm-dd` en fecha de Argentina, no UTC: exportar a las 22:00
 * de un día en Argentina (01:00 UTC del día siguiente) con el sufijo en UTC
 * fecharía el archivo un día adelantado. Se deriva de `desplazarAArgentina`
 * de `shared/domain` — NUNCA de `hoyArgentina` (propia de compras), que
 * importarla acá invertiría la dirección de dependencia entre un módulo
 * funcional y `shared`.
 */
function sufijoFechaArgentina(): string {
  return desplazarAArgentina(new Date()).toISOString().slice(0, 10);
}
