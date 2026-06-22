/**
 * RefreshTokenMapper — convierte entre Prisma RefreshToken y RefreshTokenEntity.
 *
 * Importa de '.prisma/master' solo porque está en infrastructure/.
 * Tarea: 2.C.2
 */
import type { RefreshToken as PrismaRefreshToken } from '.prisma/master';
import { RefreshTokenEntity } from '../../../domain/entities/refresh-token.entity';

export class RefreshTokenMapper {
  static toDomain(row: PrismaRefreshToken): RefreshTokenEntity {
    return RefreshTokenEntity.reconstitute(
      {
        usuarioId: row.usuarioId,
        tokenHash: row.tokenHash,
        expiresAt: row.expiresAt,
        revokedAt: row.revokedAt ?? null,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  static toPersistence(
    entity: RefreshTokenEntity,
  ): Omit<PrismaRefreshToken, 'createdAt' | 'updatedAt'> {
    return {
      id: entity.id,
      usuarioId: entity.usuarioId,
      tokenHash: entity.tokenHash,
      expiresAt: entity.expiresAt,
      revokedAt: entity.revokedAt,
      deletedAt: entity.deletedAt,
    };
  }
}
