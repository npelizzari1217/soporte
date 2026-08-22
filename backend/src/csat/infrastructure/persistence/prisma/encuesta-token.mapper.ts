/**
 * EncuestaTokenMapper — convierte entre Prisma EncuestaToken (MASTER) y
 * EncuestaTokenEntity.
 *
 * Importa de '.prisma/master' solo porque está en infrastructure/ (fitness
 * rule de ESLint lo permite acá exclusivamente).
 *
 * Ref design: sección "Modelo de datos y migraciones" (MASTER —
 * `encuesta_tokens`). Tarea: 5.2.
 */
import type { EncuestaToken as PrismaEncuestaToken } from '.prisma/master';
import { EncuestaTokenEntity } from '../../../domain/entities/encuesta-token.entity';

export class EncuestaTokenMapper {
  static toDomain(row: PrismaEncuestaToken): EncuestaTokenEntity {
    return EncuestaTokenEntity.reconstitute(
      {
        clienteId: row.clienteId,
        ticketId: row.ticketId,
        tokenHash: row.tokenHash,
        expiresAt: row.expiresAt,
        usedAt: row.usedAt ?? null,
        revokedAt: row.revokedAt ?? null,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  static toPersistence(
    entity: EncuestaTokenEntity,
  ): Omit<PrismaEncuestaToken, 'createdAt' | 'updatedAt'> {
    return {
      id: entity.id,
      clienteId: entity.clienteId,
      ticketId: entity.ticketId,
      tokenHash: entity.tokenHash,
      expiresAt: entity.expiresAt,
      usedAt: entity.usedAt,
      revokedAt: entity.revokedAt,
      deletedAt: entity.deletedAt,
    };
  }
}
