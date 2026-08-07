/**
 * EstadoMapper — convierte entre Prisma Estado (fila de DB) y EstadoEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 * La fitness rule de ESLint (no-restricted-imports) solo prohíbe imports de
 * Prisma fuera de infrastructure/ (ver backend/eslint.config.js).
 *
 * Tarea: T2.2
 */
import type { Estado as PrismaEstado } from '.prisma/tenant';
import { EstadoEntity } from '../../../domain/entities/estado.entity';

export class EstadoMapper {
  /**
   * Convierte una fila de DB Prisma → EstadoEntity de dominio.
   */
  static toDomain(row: PrismaEstado): EstadoEntity {
    return EstadoEntity.reconstitute(
      {
        codigo: row.codigo,
        nombre: row.nombre,
        color: row.color ?? null,
        orden: row.orden,
        activo: row.activo,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }
}
