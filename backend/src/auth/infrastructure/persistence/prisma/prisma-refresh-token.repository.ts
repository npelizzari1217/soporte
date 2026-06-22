/**
 * PrismaRefreshTokenRepository — implementación del puerto IRefreshTokenRepository.
 *
 * MasterContext-aware: usa el tx client de MasterContext cuando hay una transacción
 * MASTER activa (BajaUsuarioUseCase). De lo contrario, usa el master client normal.
 *
 * revokeAllByUsuarioId() usa updateMany para setear revoked_at en todos los tokens
 * activos del usuario. Es idempotente: los tokens ya revocados no cambian.
 *
 * Tarea: 2.C.2
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterContext } from '../../../../shared/tenancy/master-context';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IRefreshTokenRepository } from '../../../domain/ports/i-refresh-token.repository';
import { RefreshTokenEntity } from '../../../domain/entities/refresh-token.entity';
import { RefreshTokenMapper } from './refresh-token.mapper';

@Injectable()
export class PrismaRefreshTokenRepository implements IRefreshTokenRepository {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly masterContext: MasterContext,
  ) {}

  /**
   * Retorna el cliente activo: tx si hay transacción MASTER, master client normal en caso contrario.
   */
  private get client(): InstanceType<typeof MasterPrismaClient> {
    const txClient = this.masterContext.getClient();
    if (txClient) {
      return txClient as InstanceType<typeof MasterPrismaClient>;
    }
    return this.prismaService.getMasterClient();
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenEntity | null> {
    const row = await this.client.refreshToken.findUnique({
      where: { tokenHash },
    });
    return row ? RefreshTokenMapper.toDomain(row) : null;
  }

  async revokeAllByUsuarioId(usuarioId: string): Promise<void> {
    await this.client.refreshToken.updateMany({
      where: {
        usuarioId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
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
