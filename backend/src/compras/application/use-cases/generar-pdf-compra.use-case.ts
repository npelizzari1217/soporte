import { VerLogoClienteUseCase } from '../../../clientes/application/use-cases/ver-logo-cliente.use-case';
import { DomainError, Result } from '../../../shared/domain/result';
import { fechaCsv, fechaHoraCsv } from '../../../shared/infrastructure/csv/csv';
import { logoParaPdf } from '../../../ticket-pdf/application/services/logo-pdf';
import { CompraPdfVista, ItemCompraPdf } from '../../domain/compra-pdf-vista';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import { CompraNoEncontradaError } from '../../domain/errors/compras.errors';
import { IGeneradorPdfCompra } from '../../domain/ports/i-generador-pdf-compra';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import { EstadoAprobacionItem } from '../../domain/services/estado-compra';
import { ResolverTiposDeCompra, tipoDeCompra } from '../services/tipos-de-compra';
import { ResolverNombresSolicitantes } from '../services/nombres-de-solicitantes';
import { ETIQUETA_ESTADO } from './exportar-compras.use-case';

/** DTO de entrada de `GenerarPdfCompraUseCase`. */
export interface GenerarPdfCompraDto {
  compraId: string;
  /** Cliente del JWT: de él salen el logo y el nombre del encabezado. */
  clienteId: string;
  clienteNombre: string;
}

/** PDF listo para entregar como descarga. */
export interface GenerarPdfCompraResult {
  buffer: Buffer;
  nombreArchivo: string;
}

const ETIQUETA_APROBACION: Readonly<Record<EstadoAprobacionItem, ItemCompraPdf['aprobacion']>> =
  Object.freeze({
    PENDIENTE: 'Pendiente',
    APROBADO: 'Aprobado',
    RECHAZADO: 'Rechazado',
  });

/** Importe con separador de miles y dos decimales, al estilo argentino: `1.234,50`. */
const FORMATO_IMPORTE = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Cantidad sin decimales si es entera; si no, con dos. */
function formatearCantidad(cantidad: number): string {
  return Number.isInteger(cantidad) ? String(cantidad) : FORMATO_IMPORTE.format(cantidad);
}

/**
 * GenerarPdfCompraUseCase — arma la "Solicitud de compra" en PDF
 * (odd/tasks/compra-export-secciones-y-pdf.md, S4-S6): todos los ítems no
 * eliminados con su estado de aprobación y el total solicitado por moneda.
 *
 * La visibilidad por tipo la decide `VisibilidadCompraGuard` en la ruta; acá
 * solo se resuelve existencia, igual que el detalle.
 */
export class GenerarPdfCompraUseCase {
  constructor(
    private readonly compraRepo: Pick<ICompraRepository, 'findByIdConItems'>,
    private readonly tipos: Pick<ResolverTiposDeCompra, 'resolver'>,
    private readonly solicitantes: Pick<ResolverNombresSolicitantes, 'resolver'>,
    private readonly verLogoCliente: Pick<VerLogoClienteUseCase, 'execute'>,
    private readonly generador: IGeneradorPdfCompra,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  /**
   * @param dto compra y cliente del JWT.
   * @returns el PDF, o `CompraNoEncontradaError` si la compra no existe o está eliminada.
   */
  async execute(dto: GenerarPdfCompraDto): Promise<Result<GenerarPdfCompraResult, DomainError>> {
    const compra = await this.compraRepo.findByIdConItems(dto.compraId);
    if (!compra || compra.isDeleted()) {
      return Result.fail(new CompraNoEncontradaError(dto.compraId));
    }

    const [tipos, nombres, logo] = await Promise.all([
      this.tipos.resolver([compra.tipoTicketId]),
      this.solicitantes.resolver([compra.solicitanteId]),
      logoParaPdf(this.verLogoCliente, dto.clienteId),
    ]);

    const vista: CompraPdfVista = {
      cliente: { nombre: dto.clienteNombre, logo },
      numero: compra.numero,
      fechaSolicitud: fechaCsv(compra.fechaSolicitud),
      estado: ETIQUETA_ESTADO[compra.estado],
      motivo: compra.motivo,
      descripcion: compra.descripcion?.trim() ? compra.descripcion : null,
      tipo: tipoDeCompra(compra.tipoTicketId, tipos)?.nombre ?? null,
      solicitante: nombres.get(compra.solicitanteId) ?? 'Usuario',
      items: compra.items.filter((item) => !item.isDeleted()).map(aItemPdf),
      totales: Object.entries(compra.totalesPorMoneda)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([moneda, total]) => ({ moneda, total: FORMATO_IMPORTE.format(total) })),
      generadoEl: fechaHoraCsv(this.ahora()),
    };

    return Result.ok({
      buffer: await this.generador.generar(vista),
      nombreArchivo: `solicitud-de-compra-${compra.numero}.pdf`,
    });
  }
}

function aItemPdf(item: ItemCompraEntity): ItemCompraPdf {
  return {
    descripcion: item.descripcion,
    esServicio: item.esServicio,
    cantidad: formatearCantidad(item.cantidad),
    proveedor: item.proveedor,
    moneda: item.moneda,
    precioUnitario: FORMATO_IMPORTE.format(item.monto),
    total: FORMATO_IMPORTE.format(item.totalItem),
    aprobacion: ETIQUETA_APROBACION[item.estadoAprobacion],
    fechaCotizacion: fechaCsv(item.fechaCotizacion),
    observaciones: item.observaciones?.trim() ? item.observaciones : null,
  };
}
