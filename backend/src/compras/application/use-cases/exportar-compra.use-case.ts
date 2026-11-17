import {
  ArchivoExportDe,
  armarExport,
  FormatoExport,
} from '../../../shared/application/armar-export';
import { DomainError, Result } from '../../../shared/domain/result';
import {
  cantidadCsv,
  ColumnaCsv,
  fechaCelda,
  montoCelda,
  ValorCelda,
} from '../../../shared/infrastructure/csv/csv';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import { CompraNoEncontradaError } from '../../domain/errors/compras.errors';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import { EstadoAprobacionItem } from '../../domain/services/estado-compra';
import { ResolverTiposDeCompra, tipoDeCompra } from '../services/tipos-de-compra';
import { ETIQUETA_ESTADO } from './exportar-compras.use-case';

/** Etiquetas del estado de aprobación de un ítem, las mismas que muestra la pantalla del detalle. */
const ETIQUETA_APROBACION: Readonly<Record<EstadoAprobacionItem, string>> = Object.freeze({
  PENDIENTE: 'Pendiente',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
});

/** DTO de entrada de `ExportarCompraUseCase`. */
export interface ExportarCompraDto {
  compraId: string;
}

/**
 * ExportarCompraUseCase — exporta UNA compra a CSV o xlsx, con una fila por
 * ítem no eliminado (odd/tasks/export-compra-individual.md, S1-S5).
 *
 * Una fila por ítem, y no una cabecera arriba con los ítems abajo: con los
 * datos de la compra repetidos en cada fila el archivo se puede filtrar y
 * sumar en la planilla sin celdas combinadas, igual que el del listado.
 *
 * La visibilidad por tipo la decide `VisibilidadCompraGuard` en la ruta
 * antes de llegar acá; este caso de uso solo resuelve existencia.
 */
export class ExportarCompraUseCase {
  constructor(
    private readonly compraRepo: Pick<ICompraRepository, 'findByIdConItems'>,
    private readonly tipos: Pick<ResolverTiposDeCompra, 'resolver'>,
  ) {}

  /**
   * @param dto compra a exportar.
   * @param formato `csv` (por defecto) o `xlsx`.
   * @returns el archivo, o `CompraNoEncontradaError` si la compra no existe o está eliminada.
   */
  async execute<F extends FormatoExport | undefined = undefined>(
    dto: ExportarCompraDto,
    formato?: F,
  ): Promise<Result<ArchivoExportDe<F>, DomainError>> {
    const compra = await this.compraRepo.findByIdConItems(dto.compraId);
    if (!compra || compra.isDeleted()) {
      return Result.fail(new CompraNoEncontradaError(dto.compraId));
    }

    const tipos = await this.tipos.resolver([compra.tipoTicketId]);
    const nombreTipo = tipoDeCompra(compra.tipoTicketId, tipos)?.nombre ?? null;
    const vivos = compra.items.filter((item) => !item.isDeleted());
    // Sin ítems vivos sale igual una fila con la cabecera y las columnas de
    // ítem vacías: un archivo con solo el encabezado no diría de qué compra es.
    const filas: readonly (ItemCompraEntity | null)[] = vivos.length > 0 ? vivos : [null];

    return armarExport({
      filas,
      total: filas.length,
      // Una compra no tiene un volumen de ítems que justifique un tope propio.
      tope: Number.POSITIVE_INFINITY,
      columnas: ExportarCompraUseCase.columnas(compra, nombreTipo),
      prefijo: `compra-${compra.numero}`,
      formato,
      // Inalcanzable con tope infinito; `armarExport` exige el callback.
      alExceder: () => new CompraNoEncontradaError(dto.compraId),
    });
  }

  private static columnas(
    compra: CompraEntity,
    nombreTipo: string | null,
  ): readonly ColumnaCsv<ItemCompraEntity | null>[] {
    /** Columna de ítem: vacía en la fila de una compra sin ítems. */
    const deItem = (
      encabezado: string,
      valor: (item: ItemCompraEntity) => ValorCelda,
    ): ColumnaCsv<ItemCompraEntity | null> => ({
      encabezado,
      valor: (item) => (item === null ? null : valor(item)),
    });

    return [
      { encabezado: 'Número', valor: () => compra.numero },
      { encabezado: 'Motivo', valor: () => compra.motivo },
      { encabezado: 'Descripción de la compra', valor: () => compra.descripcion },
      { encabezado: 'Tipo', valor: () => nombreTipo },
      { encabezado: 'Estado de la compra', valor: () => ETIQUETA_ESTADO[compra.estado] },
      deItem('Descripción del ítem', (item) => item.descripcion),
      deItem('Cantidad', (item) => cantidadCsv(item.cantidad, true)),
      deItem('Proveedor', (item) => item.proveedor),
      deItem('Moneda', (item) => item.moneda),
      deItem('Monto', (item) => montoCelda(item.monto)),
      deItem('Total', (item) => montoCelda(item.totalItem)),
      deItem('Fecha de cotización', (item) => fechaCelda(item.fechaCotizacion)),
      deItem('Aprobación', (item) => ETIQUETA_APROBACION[item.estadoAprobacion]),
      deItem('Fecha de orden', (item) => fechaCelda(item.fechaOrden)),
      deItem('Fecha de recepción', (item) => fechaCelda(item.fechaRecepcion)),
      deItem('Fecha de entrega', (item) => fechaCelda(item.fechaEntrega)),
      deItem('Comprado', (item) => (item.comprado ? 'Sí' : 'No')),
      deItem('Entregado', (item) => (item.entregado ? 'Sí' : 'No')),
      deItem('Observaciones', (item) => item.observaciones),
    ];
  }
}
