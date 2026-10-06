import {
  ArchivoExport,
  ArchivoExportDe,
  armarExport,
  FormatoExport,
} from '../../../shared/application/armar-export';
import { DomainError, Result } from '../../../shared/domain/result';
import { TOPE_FILAS_EXPORT } from '../../../shared/domain/tope-filas-export';
import { ColumnaCsv, fechaCelda, montoCelda } from '../../../shared/infrastructure/csv/csv';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { ExportacionDemasiadoGrandeError } from '../../domain/errors/compras.errors';
import { CompraListFiltros, ICompraRepository } from '../../domain/ports/i-compra.repository';
import { EstadoCompra, FiltroGrupoEstadoCompra } from '../../domain/services/estado-compra';

/**
 * Máximo de compras que una exportación puede contener.
 *
 * No es un límite técnico de Postgres ni de Node: es el punto donde
 * construir el archivo entero en memoria deja de ser gratis. Con los
 * volúmenes reales de hoy (dos clientes PyME) ninguna exportación se acerca;
 * el tope existe para que el día que alguien pida "todas las compras de
 * todos los años" el sistema responda con un error claro en vez de con una
 * pausa larga y un archivo a medias.
 *
 * **Re-exportado, no propio**: el valor canónico vive ahora en
 * `shared/domain/tope-filas-export.ts` (sdd/exportar-listados-csv, D1),
 * porque las cuatro exportaciones (compras, tickets, equipos, reparaciones)
 * comparten el mismo criterio. Este re-export existe solo por
 * retrocompatibilidad: nada fuera de este módulo tiene que cambiar su
 * import para seguir leyendo `TOPE_FILAS_EXPORT` desde acá.
 */
export { TOPE_FILAS_EXPORT };

/** Mismo default que `ListarComprasUseCase`: sin filtro explícito se exportan las ACTIVAS. */
const GRUPO_ESTADO_DEFAULT: FiltroGrupoEstadoCompra = 'ACTIVAS';

/**
 * Etiquetas legibles de los estados derivados. El CSV lo lee una persona en
 * una planilla, no el sistema: `APROBADO_PARCIALMENTE` es un código interno
 * y no tiene por qué salir del backend.
 */
const ETIQUETA_ESTADO: Readonly<Record<EstadoCompra, string>> = Object.freeze({
  PENDIENTE: 'Pendiente',
  APROBADO: 'Aprobado',
  APROBADO_PARCIALMENTE: 'Aprobado parcialmente',
  RECHAZADO: 'Rechazado',
  CANCELADO: 'Cancelado',
});

/**
 * Filtros de la exportación: los MISMOS del listado, menos la paginación.
 *
 * La ausencia de `pagina`/`porPagina` es deliberada y está en el tipo, no en
 * un comentario: exportar la página visible en vez del universo filtrado es
 * el error que vuelve inútil a esta función, y acá no se puede ni expresar.
 */
export interface ExportarComprasDto {
  /** Filtro por ciclo. `undefined` = sin restricción. */
  cicloId?: string;
  /** Grupo de estado. Default `ACTIVAS`, igual que el listado. */
  estado?: FiltroGrupoEstadoCompra;
  /** Filtro por sector de cabecera. */
  sectorId?: string;
  /** Filtra por `fechaSolicitud >= fechaDesde`. */
  fechaDesde?: Date;
  /** Filtra por `fechaSolicitud <= fechaHasta`. */
  fechaHasta?: Date;
}

/** Archivo listo para que el controller lo entregue como descarga (CSV como texto, xlsx como Buffer). */
export type ExportarComprasResult = ArchivoExport;

/**
 * ExportarComprasUseCase — vuelca a CSV el listado de compras del tenant
 * activo, con los mismos filtros que la pantalla (docs/roadmap-comercial.md
 * punto 1).
 *
 * **Por qué el backend y no el frontend**: el frontend sólo tiene la página
 * cargada (20 filas). Un "exportar" que baje eso entregaría un archivo que
 * parece el listado completo y no lo es. Acá se pide el universo filtrado
 * entero en una sola lectura.
 *
 * **Autorización**: la ruta que lo consume se gatea con `COMPRAS:LECTURA`,
 * no con una acción de impresión propia. Quien ya puede ver el listado en
 * pantalla no gana acceso a ningún dato nuevo al descargarlo — y la acción
 * `IMPRESION` del catálogo exigiría reescribir el CHECK de pares válidos en
 * la base para habilitarla.
 *
 * Consulta pura: sin transacción ni bitácora, mismo criterio que
 * `ListarComprasUseCase`.
 */
export class ExportarComprasUseCase {
  constructor(private readonly compraRepo: Pick<ICompraRepository, 'findPaginaConItems'>) {}

  async execute<F extends FormatoExport | undefined = undefined>(
    dto: ExportarComprasDto,
    formato?: F,
  ): Promise<Result<ArchivoExportDe<F>, DomainError>> {
    const filtros: CompraListFiltros = {
      ...(dto.cicloId !== undefined && { cicloId: dto.cicloId }),
      grupoEstado: dto.estado ?? GRUPO_ESTADO_DEFAULT,
      ...(dto.sectorId !== undefined && { sectorId: dto.sectorId }),
      ...(dto.fechaDesde !== undefined && { fechaDesde: dto.fechaDesde }),
      ...(dto.fechaHasta !== undefined && { fechaHasta: dto.fechaHasta }),
      limit: TOPE_FILAS_EXPORT,
    };

    const { compras, total } = await this.compraRepo.findPaginaConItems(filtros);

    return armarExport({
      filas: compras,
      total,
      tope: TOPE_FILAS_EXPORT,
      columnas: ExportarComprasUseCase.columnas(compras),
      prefijo: 'compras',
      formato,
      alExceder: (total, tope) => new ExportacionDemasiadoGrandeError(total, tope),
    });
  }

  /**
   * Arma las columnas del archivo: las fijas de cabecera más una de total
   * por cada moneda presente en el conjunto exportado.
   *
   * Las columnas de moneda son dinámicas porque `totalesPorMoneda` es un
   * mapa abierto (§7.1) y una compra puede tener ítems en varias. Volcarlo
   * como un único texto `"ARS 1000,00 | USD 50,00"` sería más simple y
   * dejaría el importe sin sumar en la planilla, que es justamente para lo
   * que se exporta.
   */
  private static columnas(compras: readonly CompraEntity[]): readonly ColumnaCsv<CompraEntity>[] {
    return [
      { encabezado: 'Número', valor: (compra) => compra.numero },
      { encabezado: 'Fecha de solicitud', valor: (compra) => fechaCelda(compra.fechaSolicitud) },
      { encabezado: 'Motivo', valor: (compra) => compra.motivo },
      { encabezado: 'Estado', valor: (compra) => ETIQUETA_ESTADO[compra.estado] },
      { encabezado: 'Comprado', valor: (compra) => (compra.comprado ? 'Sí' : 'No') },
      { encabezado: 'Cerrado', valor: (compra) => (compra.cerrado ? 'Sí' : 'No') },
      ...ExportarComprasUseCase.columnasDeMoneda(compras),
    ];
  }

  /**
   * Una columna `Total <MONEDA>` por cada moneda que aparezca, ordenadas
   * alfabéticamente.
   *
   * El orden alfabético no es estético: sin un orden fijo, dos
   * exportaciones del mismo listado podrían salir con las columnas
   * permutadas según qué compra vino primera, y una planilla guardada con
   * fórmulas sobre la columna G se rompería en la exportación siguiente.
   *
   * La celda queda VACÍA cuando la compra no tiene importe en esa moneda —
   * `0,00` afirmaría que tiene uno y que vale cero.
   */
  private static columnasDeMoneda(
    compras: readonly CompraEntity[],
  ): readonly ColumnaCsv<CompraEntity>[] {
    const monedas = new Set<string>();
    for (const compra of compras) {
      for (const moneda of Object.keys(compra.totalesPorMoneda)) {
        monedas.add(moneda);
      }
    }

    return [...monedas].sort().map((moneda) => ({
      encabezado: `Total ${moneda}`,
      valor: (compra: CompraEntity) => {
        const total = compra.totalesPorMoneda[moneda];
        return total === undefined ? null : montoCelda(total);
      },
    }));
  }
}
