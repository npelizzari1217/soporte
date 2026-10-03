/**
 * PrismaPedidoPublicoTokenRepository — implementación de IPedidoPublicoTokenRepository (MASTER).
 *
 * `marcarUsado` es un `updateMany` con `usedAt: null`: a nivel Postgres, un solo
 * `UPDATE ... WHERE id = $1 AND used_at IS NULL`, así que solo una llamada concurrente gana.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IPedidoPublicoTokenRepository } from '../../../domain/ports/i-pedido-publico-token.repository';
import { PedidoPublicoTokenEntity } from '../../../domain/entities/pedido-publico-token.entity';
import { PedidoPublicoTokenMapper } from './pedido-publico-token.mapper';

@Injectable()
export class PrismaPedidoPublicoTokenRepository implements IPedidoPublicoTokenRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client(): InstanceType<typeof MasterPrismaClient> {
    return this.prismaService.getMasterClient();
  }

  async save(token: PedidoPublicoTokenEntity): Promise<void> {
    await this.client.pedidoPublicoToken.create({
      data: {
        id: token.id,
        clienteId: token.clienteId,
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt,
        usedAt: token.usedAt,
        revokedAt: token.revokedAt,
        createdAt: token.createdAt,
      },
    });
  }

  async findByHash(tokenHash: string): Promise<PedidoPublicoTokenEntity | null> {
    const row = await this.client.pedidoPublicoToken.findUnique({ where: { tokenHash } });
    return row ? PedidoPublicoTokenMapper.toDomain(row) : null;
  }

  async marcarUsado(id: string): Promise<boolean> {
    const result = await this.client.pedidoPublicoToken.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return result.count === 1;
  }
}
