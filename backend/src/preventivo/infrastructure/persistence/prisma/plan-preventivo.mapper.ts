/**
 * PlanPreventivoMapper — convierte entre Prisma PlanPreventivo (fila de DB,
 * TENANT) y PlanPreventivoEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Tarea: 4.1.
 */
import type { PlanPreventivo as PrismaPlanPreventivo } from '.prisma/tenant';
import {
  IntervaloUnidad,
  PlanPreventivoEntity,
} from '../../../domain/entities/plan-preventivo.entity';

export class PlanPreventivoMapper {
  /** Convierte una fila de DB Prisma → PlanPreventivoEntity de dominio. */
  static toDomain(row: PrismaPlanPreventivo): PlanPreventivoEntity {
    return PlanPreventivoEntity.reconstitute(
      {
        titulo: row.titulo,
        instrucciones: row.instrucciones ?? null,
        equipoId: row.equipoId ?? null,
        ubicacion: row.ubicacion ?? null,
        prioridadId: row.prioridadId,
        responsableId: row.responsableId,
        intervaloValor: row.intervaloValor,
        intervaloUnidad: row.intervaloUnidad as IntervaloUnidad,
        fechaInicio: row.fechaInicio,
        proximaEjecucionEn: row.proximaEjecucionEn,
        activo: row.activo,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /** Convierte PlanPreventivoEntity → objeto plano para Prisma upsert. */
  static toPersistence(entity: PlanPreventivoEntity): PrismaPlanPreventivo {
    return {
      id: entity.id,
      titulo: entity.titulo,
      instrucciones: entity.instrucciones,
      equipoId: entity.equipoId,
      ubicacion: entity.ubicacion,
      prioridadId: entity.prioridadId,
      responsableId: entity.responsableId,
      intervaloValor: entity.intervaloValor,
      intervaloUnidad: entity.intervaloUnidad,
      fechaInicio: entity.fechaInicio,
      proximaEjecucionEn: entity.proximaEjecucionEn,
      activo: entity.activo,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    };
  }
}
