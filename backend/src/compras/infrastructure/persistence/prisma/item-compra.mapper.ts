/**
 * ItemCompraMapper — convierte entre Prisma ItemCompra (fila de DB) y
 * ItemCompraEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * ADR-C3: `cantidad`/`monto`/`cantidadComprada`/`cantidadEntregada` son
 * `Decimal` en Prisma (`Decimal(10,2)`/`Decimal(14,2)`) — se convierten a
 * `number` en el dominio. Precedente: `equipo-informatico.mapper.ts:27-30`.
 * El round-trip `Decimal -> number -> Decimal` NO pierde precisión dentro
 * del rango de estas columnas (verificado con `Prisma.Decimal`, ver
 * `item-compra.mapper.spec.ts`) porque `Number.prototype.toString()`
 * produce la representación decimal más corta que redondea exactamente al
 * mismo float64, y `Prisma.Decimal` parsea esa cadena tal cual — no hay
 * aritmética de por medio en la conversión en sí (la aritmética en
 * centésimas, ADR-C3, vive en `estado-compra.ts`/las entidades, no acá).
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §1. Ref design: ADR-C2, ADR-C3.
 * Tarea: PR-10.
 */
import type { ItemCompra as PrismaItemCompra, Prisma } from '.prisma/tenant';
import { ItemCompraEntity } from '../../../domain/entities/item-compra.entity';
import { EstadoAprobacionItem } from '../../../domain/services/estado-compra';

export class ItemCompraMapper {
  /**
   * Convierte una fila de DB Prisma → ItemCompraEntity de dominio.
   * `estadoAprobacion` es `VarChar` en DB (ADR-C7, sin enum nativo) — el
   * CHECK `items_compra_estado_aprobacion_check` (PR-2) garantiza que sólo
   * contiene uno de los 3 valores del catálogo, así que el cast es seguro.
   */
  static toDomain(row: PrismaItemCompra): ItemCompraEntity {
    return ItemCompraEntity.reconstitute(
      {
        compraId: row.compraId,
        descripcion: row.descripcion,
        cantidad: Number(row.cantidad),
        proveedor: row.proveedor,
        monto: Number(row.monto),
        moneda: row.moneda,
        fechaCotizacion: row.fechaCotizacion,
        observaciones: row.observaciones ?? null,
        estadoAprobacion: row.estadoAprobacion as EstadoAprobacionItem,
        decididoPorId: row.decididoPorId ?? null,
        decididoEn: row.decididoEn ?? null,
        cantidadOrdenada: Number(row.cantidadOrdenada),
        cantidadRecibida: Number(row.cantidadRecibida),
        cantidadEntregada: Number(row.cantidadEntregada),
        fechaOrden: row.fechaOrden ?? null,
        fechaRecepcion: row.fechaRecepcion ?? null,
        fechaEntrega: row.fechaEntrega ?? null,
        cerradoConFaltante: row.cerradoConFaltante,
        motivoCierreFaltante: row.motivoCierreFaltante ?? null,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Convierte ItemCompraEntity → objeto plano para Prisma upsert. Incluye
   * `createdAt` para que el repo lo use en el CREATE y lo excluya del
   * UPDATE (nunca pisar el timestamp de creación existente en DB). Las
   * cantidades/montos van como `number` (Prisma acepta number/string en
   * columnas Decimal).
   */
  static toPersistence(entity: ItemCompraEntity): Omit<
    PrismaItemCompra,
    | 'updatedAt'
    | 'cantidad'
    | 'monto'
    | 'cantidadOrdenada'
    | 'cantidadRecibida'
    | 'cantidadEntregada'
  > & {
    cantidad: Prisma.Decimal | number | string;
    monto: Prisma.Decimal | number | string;
    cantidadOrdenada: Prisma.Decimal | number | string;
    cantidadRecibida: Prisma.Decimal | number | string;
    cantidadEntregada: Prisma.Decimal | number | string;
  } {
    return {
      id: entity.id,
      compraId: entity.compraId,
      descripcion: entity.descripcion,
      cantidad: entity.cantidad,
      proveedor: entity.proveedor,
      monto: entity.monto,
      moneda: entity.moneda,
      fechaCotizacion: entity.fechaCotizacion,
      observaciones: entity.observaciones,
      estadoAprobacion: entity.estadoAprobacion,
      decididoPorId: entity.decididoPorId,
      decididoEn: entity.decididoEn,
      cantidadOrdenada: entity.cantidadOrdenada,
      cantidadRecibida: entity.cantidadRecibida,
      cantidadEntregada: entity.cantidadEntregada,
      fechaOrden: entity.fechaOrden,
      fechaRecepcion: entity.fechaRecepcion,
      fechaEntrega: entity.fechaEntrega,
      cerradoConFaltante: entity.cerradoConFaltante,
      motivoCierreFaltante: entity.motivoCierreFaltante,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
