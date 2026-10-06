import { DomainError, Result } from '../domain/result';
import { serializarXlsx } from '../infrastructure/xlsx/xlsx';
import { ArmarExportCsvInput, armarExportCsv, nombreArchivoExport } from './armar-export-csv';

/** Formatos de salida de una exportación de listado. */
export const FORMATOS_EXPORT = ['csv', 'xlsx'] as const;
export type FormatoExport = (typeof FORMATOS_EXPORT)[number];

/** Content-Type de cada formato; el controller lo usa para el header. */
export const CONTENT_TYPE_EXPORT: Readonly<Record<FormatoExport, string>> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Archivo listo para que el controller lo entregue como descarga. */
export interface ArchivoExport {
  /** `string` para CSV (con BOM y encabezado); `Buffer` para xlsx. */
  contenido: string | Buffer;
  /** Nombre sugerido, con la fecha de exportación en hora de Argentina. */
  nombreArchivo: string;
}

export interface ArmarExportInput<T> extends ArmarExportCsvInput<T> {
  /** Formato de salida; por defecto `csv` (los llamadores previos no se rompen). */
  formato?: FormatoExport;
}

/**
 * armarExport — como `armarExportCsv`, pero elige el serializador según
 * `formato`. Mismas columnas, mismo tope de filas y mismo error de dominio
 * para los dos formatos: el tope se valida ANTES de serializar.
 */
export async function armarExport<T>(
  input: ArmarExportInput<T>,
): Promise<Result<ArchivoExport, DomainError>> {
  if (input.formato !== 'xlsx') {
    return armarExportCsv(input);
  }
  if (input.total > input.tope) {
    return Result.fail(input.alExceder(input.total, input.tope));
  }
  return Result.ok({
    contenido: await serializarXlsx(input.filas, input.columnas),
    nombreArchivo: nombreArchivoExport(input.prefijo, 'xlsx', input.ahora),
  });
}
