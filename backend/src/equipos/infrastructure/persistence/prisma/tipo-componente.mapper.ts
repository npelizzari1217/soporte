/**
 * TipoComponenteMapper — convierte entre Prisma TipoComponente (fila de DB)
 * y TipoComponenteEntity (dominio). Mapper de solo lectura (catálogo
 * read-only, F3-Q3) — no expone `toPersistence`.
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Tarea: T11.3.
 */
import type { TipoComponente as PrismaTipoComponente } from '.prisma/tenant';
import { TipoComponenteEntity } from '../../../domain/entities/tipo-componente.entity';

export class TipoComponenteMapper {
  /** Convierte una fila de DB Prisma → TipoComponenteEntity de dominio. */
  static toDomain(row: PrismaTipoComponente): TipoComponenteEntity {
    return TipoComponenteEntity.reconstitute(
      {
        codigo: row.codigo,
        nombre: row.nombre,
        activo: row.activo,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }
}
