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
    const items = compra.items.filter((item) => !item.isDeleted());

    return armarExport({
      filas: items,
      total: items.length,
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
  ): readonly ColumnaCsv<ItemCompraEntity>[] {
    return [
      { encabezado: 'Número', valor: () => compra.numero },
      { encabezado: 'Motivo', valor: () => compra.motivo },
      { encabezado: 'Descripción de la compra', valor: () => compra.descripcion },
      { encabezado: 'Tipo', valor: () => nombreTipo },
      { encabezado: 'Estado de la compra', valor: () => ETIQUETA_ESTADO[compra.estado] },
      { encabezado: 'Descripción del ítem', valor: (item) => item.descripcion },
      { encabezado: 'Cantidad', valor: (item) => cantidadCsv(item.cantidad, true) },
      { encabezado: 'Proveedor', valor: (item) => item.proveedor },
      { encabezado: 'Moneda', valor: (item) => item.moneda },
      { encabezado: 'Monto', valor: (item) => montoCelda(item.monto) },
      { encabezado: 'Total', valor: (item) => montoCelda(item.totalItem) },
      { encabezado: 'Fecha de cotización', valor: (item) => fechaCelda(item.fechaCotizacion) },
      { encabezado: 'Aprobación', valor: (item) => ETIQUETA_APROBACION[item.estadoAprobacion] },
      { encabezado: 'Fecha de orden', valor: (item) => fechaCelda(item.fechaOrden) },
      { encabezado: 'Fecha de recepción', valor: (item) => fechaCelda(item.fechaRecepcion) },
      { encabezado: 'Fecha de entrega', valor: (item) => fechaCelda(item.fechaEntrega) },
      { encabezado: 'Comprado', valor: (item) => (item.comprado ? 'Sí' : 'No') },
      { encabezado: 'Entregado', valor: (item) => (item.entregado ? 'Sí' : 'No') },
      { encabezado: 'Observaciones', valor: (item) => item.observaciones },
    ];
  }
}
