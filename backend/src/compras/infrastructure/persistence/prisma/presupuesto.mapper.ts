/**
 * PresupuestoMapper — convierte entre Prisma Presupuesto (fila de DB) y
 * PresupuestoEntity (dominio).
 *
 * `montoTotal` es `Decimal` en Prisma (columna `NUMERIC(14,2)`) — se
 * convierte a `number` en el dominio y de vuelta al persistir (ver misma
 * decisión que `ItemCompraMapper`).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Tarea: T3.2.
 */
import type { Presupuesto as PrismaPresupuesto, Prisma } from '.prisma/tenant';
import { PresupuestoEntity } from '../../../domain/entities/presupuesto.entity';

export class PresupuestoMapper {
  /** Convierte una fila de DB Prisma → PresupuestoEntity de dominio. */
  static toDomain(row: PrismaPresupuesto): PresupuestoEntity {
    return PresupuestoEntity.reconstitute(
      {
        ticketCompraId: row.ticketCompraId,
        proveedor: row.proveedor,
        montoTotal: Number(row.montoTotal),
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
   * Convierte PresupuestoEntity → objeto plano para Prisma upsert. Incluye
   * `createdAt` para el CREATE; el repo lo excluye del UPDATE.
   */
  static toPersistence(entity: PresupuestoEntity): Omit<
    PrismaPresupuesto,
    'updatedAt' | 'montoTotal'
  > & {
    montoTotal: Prisma.Decimal | number | string;
  } {
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
      createdAt: entity.createdAt,
    };
  }
}
