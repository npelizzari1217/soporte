/**
 * SubtareaEdiliciaMapper — convierte entre Prisma SubtareaEdilicia (fila de
 * DB) y SubtareaEdiliciaEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Tarea: T7.2.
 */
import type { SubtareaEdilicia as PrismaSubtareaEdilicia } from '.prisma/tenant';
import { SubtareaEdiliciaEntity } from '../../../domain/entities/subtarea-edilicia.entity';

export class SubtareaEdiliciaMapper {
  /** Convierte una fila de DB Prisma → SubtareaEdiliciaEntity de dominio. */
  static toDomain(row: PrismaSubtareaEdilicia): SubtareaEdiliciaEntity {
    return SubtareaEdiliciaEntity.reconstitute(
      {
        ticketEdiliciaId: row.ticketEdiliciaId,
        descripcion: row.descripcion,
        completada: row.completada,
        completadaEn: row.completadaEn ?? null,
        completadaPorId: row.completadaPorId ?? null,
        orden: row.orden,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Convierte SubtareaEdiliciaEntity → objeto plano para Prisma upsert.
   * Incluye `createdAt` para el CREATE; el repo lo excluye del UPDATE.
   */
  static toPersistence(entity: SubtareaEdiliciaEntity): Omit<PrismaSubtareaEdilicia, 'updatedAt'> {
    return {
      id: entity.id,
      ticketEdiliciaId: entity.ticketEdiliciaId,
      descripcion: entity.descripcion,
      completada: entity.completada,
      completadaEn: entity.completadaEn,
      completadaPorId: entity.completadaPorId,
      orden: entity.orden,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
