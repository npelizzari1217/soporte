/**
 * PresupuestoMapper — convierte entre Prisma Presupuesto (row de DB) y PresupuestoEntity (dominio).
 *
 * Nota sobre tipos numéricos:
 * - `montoTotal` es NUMERIC(14,2) en Postgres → Prisma lo representa como `Decimal` (runtime.Decimal).
 * - El dominio usa `number`. toDomain convierte vía `.toNumber()`.
 * - toPersistence retorna `number` directamente — Prisma acepta number | string | Decimal
 *   para campos Decimal en las operaciones de escritura (create/update).
 *   No se declara el tipo de retorno explícito para evitar conflicto con el tipo model.
 *
 * Nota sobre fechaCotizacion:
 * - `fecha_cotizacion` es DATE en Postgres → Prisma entrega un `Date` con hora 00:00 UTC.
 * - El dominio usa `Date`. Se mapea directamente.
 *
 * IMPORTANTE: este archivo SÍ puede importar de '.prisma/tenant' porque está en
 * infrastructure/. La fitness rule (0.A.3) solo prohíbe imports de Prisma fuera de infra.
 *
 * Tarea: 4.C.2
 */
import type { Presupuesto as PrismaPresupuesto } from '.prisma/tenant';
import { PresupuestoEntity } from '../../../domain/entities/presupuesto.entity';

export class PresupuestoMapper {
  /**
   * Convierte una fila de DB Prisma → PresupuestoEntity de dominio.
   * Usa PresupuestoEntity.reconstitute() para hidratar correctamente los timestamps.
   * No valida moneda — los datos ya fueron validados al persistir.
   */
  static toDomain(row: PrismaPresupuesto): PresupuestoEntity {
    return PresupuestoEntity.reconstitute(
      {
        ticketCompraId: row.ticketCompraId,
        proveedor: row.proveedor,
        // Decimal.toNumber() convierte el Decimal de Prisma al number del dominio
        montoTotal: row.montoTotal.toNumber(),
        moneda: row.moneda,
        fechaCotizacion: row.fechaCotizacion,
        seleccionado: row.seleccionado,
        observaciones: row.observaciones ?? null,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Convierte PresupuestoEntity → objeto para Prisma upsert.
   * Prisma acepta `number` para campos Decimal en operaciones de escritura.
   * No se anota el tipo de retorno explícito para no conflictuar con el tipo model
   * (que usa Prisma.Decimal, no number).
   */
  static toPersistence(entity: PresupuestoEntity) {
    return {
      id: entity.id,
      ticketCompraId: entity.ticketCompraId,
      proveedor: entity.proveedor,
      montoTotal: entity.montoTotal,
      moneda: entity.moneda,
      fechaCotizacion: entity.fechaCotizacion,
      seleccionado: entity.seleccionado,
      observaciones: entity.observaciones,
      deletedAt: entity.deletedAt,
    };
  }
}
