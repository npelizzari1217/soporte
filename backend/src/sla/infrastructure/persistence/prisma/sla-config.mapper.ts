/**
 * SlaConfigMapper — convierte entre Prisma SlaConfig (fila de DB) y
 * SlaConfigEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Tarea: SA7.
 */
import type { SlaConfig as PrismaSlaConfig } from '.prisma/tenant';
import { SlaConfigEntity } from '../../../domain/entities/sla-config.entity';

export class SlaConfigMapper {
  /** Convierte una fila de DB Prisma → SlaConfigEntity de dominio. */
  static toDomain(row: PrismaSlaConfig): SlaConfigEntity {
    return SlaConfigEntity.reconstitute(
      {
        prioridadId: row.prioridadId,
        horas: row.horas,
        activo: row.activo,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Convierte SlaConfigEntity → objeto plano para Prisma upsert. Incluye
   * `createdAt` para que el repo lo use en el CREATE y lo excluya del
   * UPDATE (nunca pisar el timestamp de creación existente).
   */
  static toPersistence(entity: SlaConfigEntity): Omit<PrismaSlaConfig, 'updatedAt'> {
    return {
      id: entity.id,
      prioridadId: entity.prioridadId,
      horas: entity.horas,
      activo: entity.activo,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
