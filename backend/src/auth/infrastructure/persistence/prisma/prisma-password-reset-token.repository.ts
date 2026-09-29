/**
 * PrismaPasswordResetTokenRepository — implementación del puerto
 * `IPasswordResetTokenRepository` (MASTER, `password_reset_tokens`).
 *
 * `consumirSiVigente` es el CAS de uso único (ADR-5/ADR-6): `updateMany` con
 * `where: { id, usedAt: null, revokedAt: null, expiresAt: { gt: now } }` es
 * una sola sentencia `UPDATE` atómica. `now` es el reloj de la aplicación
 * (`new Date()` viaja como parámetro), no el `now()` de Postgres: un desvío
 * de reloj entre los dos corre el vencimiento en esa misma medida. `result.count` es 1 solo si ESTA llamada ganó la carrera; una
 * segunda llamada sobre el mismo id ya no encuentra `used_at IS NULL` y
 * devuelve 0 filas afectadas → `false`. Mismo resultado si el token fue
 * revocado por una solicitud posterior, o si venció.
 *
 * Ref design: ADR-5, ADR-6. Tarea: 2.3.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IPasswordResetTokenRepository } from '../../../domain/ports/i-password-reset-token.repository';
import { PasswordResetTokenEntity } from '../../../domain/entities/password-reset-token.entity';
import { PasswordResetTokenMapper } from './password-reset-token.mapper';

@Injectable()
export class PrismaPasswordResetTokenRepository implements IPasswordResetTokenRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client(): InstanceType<typeof MasterPrismaClient> {
    return this.prismaService.getMasterClient();
  }

  async findByHash(tokenHash: string): Promise<PasswordResetTokenEntity | null> {
    const row = await this.client.passwordResetToken.findUnique({ where: { tokenHash } });
    return row ? PasswordResetTokenMapper.toDomain(row) : null;
  }

  async save(token: PasswordResetTokenEntity): Promise<void> {
    const data = PasswordResetTokenMapper.toPersistence(token);
    const { id, ...updateData } = data;

    await this.client.passwordResetToken.upsert({
      where: { id },
      create: data,
      update: updateData,
    });
  }

  async revocarVigentesDeUsuario(usuarioId: string): Promise<number> {
    const result = await this.client.passwordResetToken.updateMany({
      where: { usuarioId, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async consumirSiVigente(tokenId: string): Promise<boolean> {
    const result = await this.client.passwordResetToken.updateMany({
      where: { id: tokenId, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    return result.count === 1;
  }
}
