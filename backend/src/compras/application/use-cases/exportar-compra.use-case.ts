import {
  ArchivoExportDe,
  armarExportSecciones,
  FormatoExport,
} from '../../../shared/application/armar-export';
import { DomainError, Result } from '../../../shared/domain/result';
import {
  cantidadCsv,
  ColumnaCsv,
  fechaCelda,
  montoCelda,
  seccionExport,
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
 * ExportarCompraUseCase — exporta UNA compra a CSV o xlsx: arriba la
 * cabecera (fila de títulos y fila de valores), una fila vacía, y abajo los
 * ítems no eliminados (odd/tasks/compra-export-secciones-y-pdf.md, S1-S3).
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

    return Result.ok(
      await armarExportSecciones({
        secciones: [
          seccionExport([compra], ExportarCompraUseCase.columnasCompra(nombreTipo)),
          seccionExport(items, COLUMNAS_ITEM),
        ],
        prefijo: `compra-${compra.numero}`,
        formato,
      }),
    );
  }

  /** Cabecera: una fila de títulos y una de valores (odd/tasks/compra-export-secciones-y-pdf.md, S1). */
  private static columnasCompra(nombreTipo: string | null): readonly ColumnaCsv<CompraEntity>[] {
    return [
      { encabezado: 'Número', valor: (compra) => compra.numero },
      { encabezado: 'Fecha de solicitud', valor: (compra) => fechaCelda(compra.fechaSolicitud) },
      { encabezado: 'Motivo', valor: (compra) => compra.motivo },
      { encabezado: 'Descripción', valor: (compra) => compra.descripcion },
      { encabezado: 'Tipo', valor: () => nombreTipo },
      { encabezado: 'Estado', valor: (compra) => ETIQUETA_ESTADO[compra.estado] },
    ];
  }
}

/** Columnas de los ítems; ya no repiten los datos de la compra (S2). */
const COLUMNAS_ITEM: readonly ColumnaCsv<ItemCompraEntity>[] = [
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
