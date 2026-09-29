/**
 * PasswordResetTokenMapper — convierte entre Prisma PasswordResetToken
 * (MASTER) y PasswordResetTokenEntity.
 *
 * Importa de '.prisma/master' solo porque está en infrastructure/ (fitness
 * rule de ESLint lo permite acá exclusivamente).
 *
 * Ref design: ADR-6. Tarea: 2.2.
 */
import type { PasswordResetToken as PrismaPasswordResetToken } from '.prisma/master';
import { PasswordResetTokenEntity } from '../../../domain/entities/password-reset-token.entity';

export class PasswordResetTokenMapper {
  static toDomain(row: PrismaPasswordResetToken): PasswordResetTokenEntity {
    return PasswordResetTokenEntity.reconstitute(
      {
        usuarioId: row.usuarioId,
        clienteId: row.clienteId,
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
    entity: PasswordResetTokenEntity,
  ): Omit<PrismaPasswordResetToken, 'createdAt' | 'updatedAt'> {
    return {
      id: entity.id,
      usuarioId: entity.usuarioId,
      clienteId: entity.clienteId,
      tokenHash: entity.tokenHash,
      expiresAt: entity.expiresAt,
      usedAt: entity.usedAt,
      revokedAt: entity.revokedAt,
      deletedAt: entity.deletedAt,
    };
  }
}
