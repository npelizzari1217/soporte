/**
 * EstadoMapper — convierte entre Prisma Estado (row de DB) y EstadoEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 * La fitness rule (0.A.3) solo prohíbe imports de Prisma fuera de infra.
 *
 * Tarea: 3.D.2
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
