import {
  ArchivoExport,
  ArchivoExportDe,
  armarExport,
  FormatoExport,
} from '../../../shared/application/armar-export';
import { DomainError, Result } from '../../../shared/domain/result';
import { TOPE_FILAS_EXPORT } from '../../../shared/domain/tope-filas-export';
import { cantidadCsv, ColumnaCsv, fechaHoraCelda } from '../../../shared/infrastructure/csv/csv';
import { EstadoReposicionInsumo } from '../../domain/entities/estado-reposicion-insumo';
import { ExportacionStockDemasiadoGrandeError } from '../../domain/errors/insumos.errors';
import {
  ConsultarReporteStockUseCase,
  FilaReporteStock,
  FiltrosReporteStock,
} from './consultar-reporte-stock.use-case';

/** Archivo listo para que el controller lo entregue como descarga (CSV como texto, xlsx como Buffer). */
export type ExportarReporteStockResult = ArchivoExport;

/** Mismas etiquetas que la ficha del insumo (`insumo-detail-view.tsx`). */
const ETIQUETA_REPOSICION: Record<EstadoReposicionInsumo, string> = {
  SIN_PUNTO_DEFINIDO: 'Sin punto de reposición definido',
  SUFICIENTE: 'Existencia suficiente',
  BAJO_MINIMO: 'Hay que reponer',
};

/**
 * ExportarReporteStockUseCase — vuelca a CSV el reporte de stock (ADR-4 de
 * `reporte-stock-insumos`).
 *
 * Compone `ConsultarReporteStockUseCase` con los MISMOS filtros que recibio,
 * asi que las filas y su orden son las del JSON. El tope se chequea sobre
 * `filas.length` despues del filtro (residual aceptado, igual que
 * `ExportarEquiposUseCase`). El reporte no lleva ninguna columna de dinero.
 * Lectura pura: sin transaccion ni lock.
 */
export class ExportarReporteStockUseCase {
  constructor(private readonly consultar: Pick<ConsultarReporteStockUseCase, 'execute'>) {}

  async execute<F extends FormatoExport | undefined = undefined>(
    filtros: FiltrosReporteStock = {},
    formato?: F,
  ): Promise<Result<ArchivoExportDe<F>, DomainError>> {
    const reporte = await this.consultar.execute(filtros);

    return armarExport({
      filas: reporte.filas,
      total: reporte.filas.length,
      tope: TOPE_FILAS_EXPORT,
      columnas: ExportarReporteStockUseCase.columnas(reporte.generadoEn),
      prefijo: 'reporte-stock-insumos',
      formato,
      alExceder: (total, tope) => new ExportacionStockDemasiadoGrandeError(total, tope),
      ahora: reporte.generadoEn,
    });
  }

  /** Columnas fijas del archivo; "Generado el" se repite por fila para no romper la tabla. */
  private static columnas(generadoEn: Date): readonly ColumnaCsv<FilaReporteStock>[] {
    const generado = fechaHoraCelda(generadoEn);
    return [
      { encabezado: 'Código', valor: (f) => f.codigo },
      { encabezado: 'Nombre', valor: (f) => f.nombre },
      { encabezado: 'Familia', valor: (f) => f.familia.nombre },
      { encabezado: 'Tipo', valor: (f) => (f.familia.esRepuesto ? 'Repuesto' : 'Consumible') },
      { encabezado: 'Unidad de medida', valor: (f) => f.unidadMedida.nombre },
      {
        encabezado: 'Stock nuevo',
        valor: (f) => cantidadCsv(f.saldos.NUEVO, f.unidadMedida.entera),
      },
      {
        encabezado: 'Stock usado',
        valor: (f) => cantidadCsv(f.saldos.USADO, f.unidadMedida.entera),
      },
      {
        encabezado: 'Stock total',
        valor: (f) => cantidadCsv(f.saldos.total, f.unidadMedida.entera),
      },
      {
        encabezado: 'Punto de reposición',
        valor: (f) =>
          f.stockMinimo === null ? null : cantidadCsv(f.stockMinimo, f.unidadMedida.entera),
      },
      {
        encabezado: 'Estado de reposición',
        valor: (f) => ETIQUETA_REPOSICION[f.estadoReposicion],
      },
      { encabezado: 'Estado', valor: (f) => (f.activo ? 'Habilitado' : 'Deshabilitado') },
      { encabezado: 'Generado el', valor: () => generado },
    ];
  }
}
