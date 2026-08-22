/**
 * ReparacionCompraMapper — convierte la fila cruda de Prisma (vínculo +
 * compra + ítems) a `CompraVinculada`, la vista estructural que
 * `bloqueo-reparacion.ts` (dominio) necesita para derivar el bloqueo.
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * NO re-deriva la aritmética de `comprado`/`entregado`: delega en
 * `itemComprado`/`itemEntregado` (`compras/domain/services/estado-compra.ts`),
 * las mismas funciones que usa el módulo de compras — mismo criterio que
 * `item-compra.mapper.ts` (`ItemCompraEntity`, PR-10).
 *
 * Filtra los ítems soft-deleted ANTES de armar la vista: `CompraParaDerivacion`
 * asume "items ya excluye los eliminados" (mismo contrato que
 * `CompraEntity.itemsActivos()`).
 *
 * Ref design: sdd/reparacion-bloqueada-por-compra/design, D1, D2, contrato
 * `bloqueo-reparacion.ts`. Tarea: WU2.3.
 */
import type {
  Compra as PrismaCompra,
  ItemCompra as PrismaItemCompra,
  ReparacionCompra as PrismaReparacionCompra,
} from '.prisma/tenant';
import {
  EstadoAprobacionItem,
  itemComprado,
  itemEntregado,
} from '../../../../compras/domain/services/estado-compra';
import { CompraVinculada } from '../../../domain/services/bloqueo-reparacion';

/** Fila de `reparacion_compra` con la compra y sus ítems incluidos (`include`). */
export type ReparacionCompraConCompraEItems = PrismaReparacionCompra & {
  compra: PrismaCompra & { items: PrismaItemCompra[] };
};

export class ReparacionCompraMapper {
  /** Convierte una fila con `compra`/`items` incluidos → `CompraVinculada` de dominio. */
  static toCompraVinculada(row: ReparacionCompraConCompraEItems): CompraVinculada {
    const itemsActivos = row.compra.items.filter((item) => item.deletedAt === null);

    return {
      compraId: row.compra.id,
      numero: row.compra.numero,
      cancelada: row.compra.canceladaEn !== null,
      items: itemsActivos.map((item) => {
        const vista = {
          cantidad: Number(item.cantidad),
          cantidadRecibida: Number(item.cantidadRecibida),
          cantidadEntregada: Number(item.cantidadEntregada),
          cerradoConFaltante: item.cerradoConFaltante,
        };
        return {
          estadoAprobacion: item.estadoAprobacion as EstadoAprobacionItem,
          comprado: itemComprado(vista),
          entregado: itemEntregado(vista),
        };
      }),
    };
  }
}
