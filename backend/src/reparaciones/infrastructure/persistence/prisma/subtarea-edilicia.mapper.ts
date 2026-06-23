/**
 * SubtareaEdiliciaMapper — convierte entre Prisma SubtareaEdilicia y SubtareaEdiliciaEntity.
 *
 * IMPORTANTE: este archivo SÍ puede importar de '.prisma/tenant' porque está en
 * infrastructure/. La fitness rule (0.A.3) solo prohíbe imports de Prisma fuera de infra.
 *
 * Tarea: 5.C.2
 */
import type { SubtareaEdilicia as PrismaSubtareaEdilicia } from '.prisma/tenant';
import { SubtareaEdiliciaEntity } from '../../../domain/entities/subtarea-edilicia.entity';

export class SubtareaEdiliciaMapper {
  /**
   * Convierte una fila de DB Prisma → SubtareaEdiliciaEntity de dominio.
   */
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
   * SubtareaEdiliciaEntity → objeto plano para Prisma upsert.
   * Excluye createdAt y updatedAt (manejados por Prisma @default/@updatedAt).
   */
  static toPersistence(
    entity: SubtareaEdiliciaEntity,
  ): Omit<PrismaSubtareaEdilicia, 'createdAt' | 'updatedAt'> {
    return {
      id: entity.id,
      ticketEdiliciaId: entity.ticketEdiliciaId,
      descripcion: entity.descripcion,
      completada: entity.completada,
      completadaEn: entity.completadaEn,
      completadaPorId: entity.completadaPorId,
      orden: entity.orden,
      deletedAt: entity.deletedAt,
    };
  }
}
