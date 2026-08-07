/**
 * PrismaRefreshTokenRepository — implementación del puerto IRefreshTokenRepository.
 *
 * revokeAllByUsuarioId() usa updateMany para setear revoked_at en todos los
 * tokens activos del usuario (R9, LogoutAllUseCase). Idempotente: los tokens
 * ya revocados no cambian.
 *
 * Tarea: T5.4 (PR5 — Persistencia + Prisma repos + TenantContext)
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { IRefreshTokenRepository } from '../../../domain/ports/i-refresh-token.repository';
import { RefreshTokenEntity } from '../../../domain/entities/refresh-token.entity';
import { RefreshTokenMapper } from './refresh-token.mapper';

@Injectable()
export class PrismaRefreshTokenRepository implements IRefreshTokenRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client() {
    return this.prismaService.getMasterClient();
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenEntity | null> {
    const row = await this.client.refreshToken.findUnique({ where: { tokenHash } });
    return row ? RefreshTokenMapper.toDomain(row) : null;
  }

  async revokeAllByUsuarioId(usuarioId: string): Promise<void> {
    await this.client.refreshToken.updateMany({
      where: { usuarioId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async save(token: RefreshTokenEntity): Promise<void> {
    const data = RefreshTokenMapper.toPersistence(token);
    const { id, ...updateData } = data;

    await this.client.refreshToken.upsert({
      where: { id },
      create: data,
      update: updateData,
    });
  }
}
