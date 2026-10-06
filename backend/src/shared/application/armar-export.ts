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

/** Archivo CSV listo para descargar: texto con BOM y encabezado. */
export interface ArchivoCsv {
  contenido: string;
  /** Nombre sugerido, con la fecha de exportación en hora de Argentina. */
  nombreArchivo: string;
}

/** Archivo xlsx listo para descargar: contenido binario. */
export interface ArchivoXlsx {
  contenido: Buffer;
  nombreArchivo: string;
}

/** Archivo listo para que el controller lo entregue como descarga. */
export type ArchivoExport = ArchivoCsv | ArchivoXlsx;

/**
 * Archivo que corresponde al formato pedido: sin formato (o `csv`) es texto,
 * así quien no pide xlsx sigue leyendo `contenido` como `string`; con
 * `FormatoExport` completo (el controller) es la unión.
 */
export type ArchivoExportDe<F extends FormatoExport | undefined> = F extends 'xlsx'
  ? ArchivoXlsx
  : F extends 'csv' | undefined
    ? ArchivoCsv
    : never;

export interface ArmarExportInput<
  T,
  F extends FormatoExport | undefined = undefined,
> extends ArmarExportCsvInput<T> {
  /** Formato de salida; por defecto `csv` (los llamadores previos no se rompen). */
  formato?: F;
}

/**
 * armarExport — como `armarExportCsv`, pero elige el serializador según
 * `formato`. Mismas columnas, mismo tope de filas y mismo error de dominio
 * para los dos formatos: el tope se valida ANTES de serializar.
 */
export async function armarExport<T, F extends FormatoExport | undefined = undefined>(
  input: ArmarExportInput<T, F>,
): Promise<Result<ArchivoExportDe<F>, DomainError>> {
  // El tipo de retorno depende del formato pedido; la implementación no
  // puede probárselo a TypeScript, por eso el único cast vive acá.
  return armarSegunFormato(input) as Promise<Result<ArchivoExportDe<F>, DomainError>>;
}

async function armarSegunFormato<T>(
  input: ArmarExportInput<T, FormatoExport | undefined>,
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
