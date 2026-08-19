/**
 * KbArticuloMapper — convierte entre Prisma KbArticulo (fila de la DB MASTER)
 * y KbArticuloEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/master'.
 *
 * Tarea: K6.
 */
import type { KbArticulo as PrismaKbArticulo } from '.prisma/master';
import { KbArticuloEntity } from '../../../domain/entities/kb-articulo.entity';

export class KbArticuloMapper {
  /** Convierte una fila de DB Prisma → KbArticuloEntity de dominio. */
  static toDomain(row: PrismaKbArticulo): KbArticuloEntity {
    return KbArticuloEntity.reconstitute(
      {
        titulo: row.titulo,
        contenido: row.contenido,
        autorId: row.autorId,
        visibleParaSolicitante: row.visibleParaSolicitante,
        activo: row.activo,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Convierte KbArticuloEntity → objeto plano para Prisma upsert. Incluye
   * `createdAt` para que el repo lo use en el CREATE y lo excluya del
   * UPDATE (nunca pisar el timestamp de creación existente).
   *
   * `slug` queda AFUERA a propósito, y no es un olvido. El slug es la identidad
   * de los artículos que se mantienen como markdown en el repositorio y los
   * escribe únicamente el sync (`scripts/sync-ayuda.js`); el dominio no lo
   * conoce. Si viajara acá valdría `null` y el UPDATE del upsert se lo borraría
   * al primer artículo sincronizado que alguien editara desde la aplicación —
   * y el sync siguiente lo insertaría de nuevo, duplicado. Al no estar en el
   * objeto, Prisma no lo toca: el CREATE lo deja NULL (correcto para un
   * artículo nacido en la aplicación) y el UPDATE lo respeta.
   */
  static toPersistence(entity: KbArticuloEntity): Omit<PrismaKbArticulo, 'updatedAt' | 'slug'> {
    return {
      id: entity.id,
      titulo: entity.titulo,
      contenido: entity.contenido,
      autorId: entity.autorId,
      visibleParaSolicitante: entity.visibleParaSolicitante,
      activo: entity.activo,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
