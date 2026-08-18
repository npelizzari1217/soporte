/**
 * ComentarioReparacionMapper — convierte entre Prisma ComentarioReparacion
 * (fila de DB) y ComentarioReparacionEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 */
import type { ComentarioReparacion as PrismaComentarioReparacion } from '.prisma/tenant';
import { ComentarioReparacionEntity } from '../../../domain/entities/comentario-reparacion.entity';

export class ComentarioReparacionMapper {
  /** Convierte una fila de DB Prisma → ComentarioReparacionEntity de dominio. */
  static toDomain(row: PrismaComentarioReparacion): ComentarioReparacionEntity {
    return ComentarioReparacionEntity.reconstitute(
      {
        ticketEdiliciaId: row.ticketEdiliciaId,
        texto: row.texto,
        autorId: row.autorId,
      },
      row.id,
      row.createdAt,
    );
  }

  /**
   * Convierte ComentarioReparacionEntity → objeto plano para el INSERT de
   * Prisma. Incluye `id` (lo genera `BaseEntity`, UUIDv7 — no la DB, a
   * diferencia de `operaciones_compra`) y `createdAt`. Sin `updatedAt` ni
   * `deletedAt`: la tabla es append-only y no tiene esas columnas.
   */
  static toPersistence(entity: ComentarioReparacionEntity): PrismaComentarioReparacion {
    return {
      id: entity.id,
      ticketEdiliciaId: entity.ticketEdiliciaId,
      texto: entity.texto,
      autorId: entity.autorId,
      createdAt: entity.createdAt,
    };
  }
}
