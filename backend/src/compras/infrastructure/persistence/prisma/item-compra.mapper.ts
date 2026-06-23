/**
 * ItemCompraMapper — convierte entre Prisma ItemCompra (row de DB) y ItemCompraEntity (dominio).
 *
 * Nota sobre tipos numéricos:
 * - `cantidad` es NUMERIC(10,2) en Postgres → Prisma lo representa como `Decimal` (runtime.Decimal).
 * - `precioUnitarioRef` es NUMERIC(14,2) nullable → `Decimal | null`.
 * - El dominio usa `number`. toDomain convierte vía `.toNumber()`.
 * - toPersistence retorna `number` directamente — Prisma acepta number | string | Decimal
 *   para campos Decimal en las operaciones de escritura (create/update).
 *   No se declara el tipo de retorno explícito para evitar conflicto con el tipo model.
 *
 * IMPORTANTE: este archivo SÍ puede importar de '.prisma/tenant' porque está en
 * infrastructure/. La fitness rule (0.A.3) solo prohíbe imports de Prisma fuera de infra.
 *
 * Tarea: 4.C.2
 */
import type { ItemCompra as PrismaItemCompra } from '.prisma/tenant';
import { ItemCompraEntity } from '../../../domain/entities/item-compra.entity';

export class ItemCompraMapper {
  /**
   * Convierte una fila de DB Prisma → ItemCompraEntity de dominio.
   * Usa ItemCompraEntity.reconstitute() para hidratar correctamente los timestamps.
   */
  static toDomain(row: PrismaItemCompra): ItemCompraEntity {
    return ItemCompraEntity.reconstitute(
      {
        ticketCompraId: row.ticketCompraId,
        descripcion: row.descripcion,
        // Decimal.toNumber() convierte el Decimal de Prisma al number del dominio
        cantidad: row.cantidad.toNumber(),
        unidad: row.unidad ?? null,
        precioUnitarioRef: row.precioUnitarioRef ? row.precioUnitarioRef.toNumber() : null,
        observaciones: row.observaciones ?? null,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Convierte ItemCompraEntity → objeto para Prisma upsert.
   * Prisma acepta `number` para campos Decimal en operaciones de escritura.
   * No se anota el tipo de retorno explícito para no conflictuar con el tipo model
   * (que usa Prisma.Decimal, no number).
   */
  static toPersistence(entity: ItemCompraEntity) {
    return {
      id: entity.id,
      ticketCompraId: entity.ticketCompraId,
      descripcion: entity.descripcion,
      cantidad: entity.cantidad,
      unidad: entity.unidad,
      precioUnitarioRef: entity.precioUnitarioRef,
      observaciones: entity.observaciones,
      deletedAt: entity.deletedAt,
    };
  }
}
