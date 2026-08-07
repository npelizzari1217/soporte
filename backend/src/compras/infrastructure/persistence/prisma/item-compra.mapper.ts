/**
 * ItemCompraMapper — convierte entre Prisma ItemCompra (fila de DB) y
 * ItemCompraEntity (dominio).
 *
 * `cantidad`/`precioUnitarioRef` son `Decimal` en Prisma (columnas
 * `NUMERIC`) — se convierten a `number` en el dominio (montos/cantidades de
 * esta escala no requieren precisión arbitraria) y de vuelta a `Decimal`
 * (vía el string de Prisma, aceptado por el input type) al persistir.
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Tarea: T3.2.
 */
import type { ItemCompra as PrismaItemCompra, Prisma } from '.prisma/tenant';
import { ItemCompraEntity } from '../../../domain/entities/item-compra.entity';

export class ItemCompraMapper {
  /** Convierte una fila de DB Prisma → ItemCompraEntity de dominio. */
  static toDomain(row: PrismaItemCompra): ItemCompraEntity {
    return ItemCompraEntity.reconstitute(
      {
        ticketCompraId: row.ticketCompraId,
        descripcion: row.descripcion,
        cantidad: Number(row.cantidad),
        unidad: row.unidad ?? null,
        precioUnitarioRef: row.precioUnitarioRef !== null ? Number(row.precioUnitarioRef) : null,
        observaciones: row.observaciones ?? null,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Convierte ItemCompraEntity → objeto plano para Prisma upsert. Incluye
   * `createdAt` para el CREATE; el repo lo excluye del UPDATE.
   */
  static toPersistence(entity: ItemCompraEntity): Omit<
    PrismaItemCompra,
    'updatedAt' | 'cantidad' | 'precioUnitarioRef'
  > & {
    cantidad: Prisma.Decimal | number | string;
    precioUnitarioRef: Prisma.Decimal | number | string | null;
  } {
    return {
      id: entity.id,
      ticketCompraId: entity.ticketCompraId,
      descripcion: entity.descripcion,
      cantidad: entity.cantidad,
      unidad: entity.unidad,
      precioUnitarioRef: entity.precioUnitarioRef,
      observaciones: entity.observaciones,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
