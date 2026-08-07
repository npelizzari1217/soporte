/**
 * RefreshTokenMapper — convierte entre Prisma RefreshToken y RefreshTokenEntity.
 *
 * Incluye `clienteId` (Opción B — decisión #2025, reemplaza ADR-2 de
 * `sdd/auth-multitenancy/design`): el scope con el que el refresh token fue
 * emitido queda embebido en la fila (`null` = scope MASTER).
 *
 * Importa de '.prisma/master' solo porque está en infrastructure/.
 * Tarea: T5.4 (PR5 — Persistencia + Prisma repos + TenantContext)
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
        clienteId: row.clienteId ?? null,
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
      clienteId: entity.clienteId,
      tokenHash: entity.tokenHash,
      expiresAt: entity.expiresAt,
      revokedAt: entity.revokedAt,
      deletedAt: entity.deletedAt,
    };
  }
}
