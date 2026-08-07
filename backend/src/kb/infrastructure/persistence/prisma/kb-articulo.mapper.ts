/**
 * KbArticuloMapper — convierte entre Prisma KbArticulo (fila de DB) y
 * KbArticuloEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Tarea: K6.
 */
import type { KbArticulo as PrismaKbArticulo } from '.prisma/tenant';
import { KbArticuloEntity } from '../../../domain/entities/kb-articulo.entity';

export class KbArticuloMapper {
  /** Convierte una fila de DB Prisma → KbArticuloEntity de dominio. */
  static toDomain(row: PrismaKbArticulo): KbArticuloEntity {
    return KbArticuloEntity.reconstitute(
      {
        titulo: row.titulo,
        contenido: row.contenido,
        tipoTicketId: row.tipoTicketId,
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
   */
  static toPersistence(entity: KbArticuloEntity): Omit<PrismaKbArticulo, 'updatedAt'> {
    return {
      id: entity.id,
      titulo: entity.titulo,
      contenido: entity.contenido,
      tipoTicketId: entity.tipoTicketId,
      autorId: entity.autorId,
      visibleParaSolicitante: entity.visibleParaSolicitante,
      activo: entity.activo,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
