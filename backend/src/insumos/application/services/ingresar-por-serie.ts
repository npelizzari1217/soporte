import { DomainError, Result } from '../../../shared/domain/result';
import { MovimientoInsumoEntity } from '../../domain/entities/movimiento-insumo.entity';
import { CondicionStock } from '../../domain/entities/tipo-movimiento-insumo';
import {
  CantidadNoEnteraError,
  SerialesNoCoincidenError,
} from '../../domain/errors/unidades-insumo.errors';
import { OperacionesUnidadInsumo } from './operaciones-unidad-insumo.service';

/** Datos de un ingreso por serie: los que comparten la entrada y el ajuste positivo. */
export interface IngresoPorSerie {
  insumoId: string;
  cantidad: number;
  seriales?: readonly string[] | null;
  /**
   * Rellena con unidades pendientes (serial `null`) hasta la cantidad. Solo la
   * recepción de compra lo pide (ADR-6); sin él, los seriales deben ser tantos
   * como la cantidad.
   */
  completarConPendientes?: boolean;
  condicion: CondicionStock;
  tipo: 'ENTRADA' | 'AJUSTE_POSITIVO';
  usuarioId: string;
  motivo?: string | null;
  itemCompraId?: string | null;
  equipoId?: string | null;
}

/**
 * Da de alta las unidades de un insumo `SERIE` (ADR-5): valida que la cantidad
 * sea entera y que los seriales cuadren con ella, y delega en
 * `OperacionesUnidadInsumo.ingresar`, que toma L1, L2 y valida todo el lote
 * antes de escribir. Debe correr dentro de la transacción del llamador.
 *
 * @returns Los movimientos asentados, uno por unidad y en el orden de las piezas.
 */
export async function ingresarPorSerie(
  operaciones: Pick<OperacionesUnidadInsumo, 'ingresar'>,
  dto: IngresoPorSerie,
): Promise<Result<MovimientoInsumoEntity[], DomainError>> {
  // Violación de contrato del caller, como en `MovimientoInsumoEntity.create()`:
  // el borde la rechaza con un 400 antes de llegar acá.
  if (!Number.isFinite(dto.cantidad) || dto.cantidad <= 0) {
    throw new Error(`La cantidad del movimiento debe ser un número positivo: ${dto.cantidad}.`);
  }
  if (!Number.isInteger(dto.cantidad)) {
    return Result.fail(new CantidadNoEnteraError(dto.cantidad));
  }

  const seriales = dto.seriales ?? [];
  const cuadra =
    dto.completarConPendientes === true
      ? seriales.length <= dto.cantidad
      : seriales.length === dto.cantidad;
  if (!cuadra) {
    return Result.fail(new SerialesNoCoincidenError(dto.cantidad, seriales.length));
  }

  const piezas: Array<{ numeroSerie: string | null }> = seriales.map((numeroSerie) => ({
    numeroSerie,
  }));
  while (piezas.length < dto.cantidad) piezas.push({ numeroSerie: null });

  const ingresadas = await operaciones.ingresar(dto.insumoId, piezas, {
    usuarioId: dto.usuarioId,
    motivo: dto.motivo,
    condicion: dto.condicion,
    tipo: dto.tipo,
    itemCompraId: dto.itemCompraId,
    equipoId: dto.equipoId,
  });
  if (ingresadas.isFail()) return Result.fail(ingresadas.getError());

  return Result.ok(ingresadas.getValue().map((i) => i.movimiento));
}
