/**
 * PedidoPublicoTokenMapper — fila Prisma (MASTER) <-> PedidoPublicoTokenEntity.
 * Vive en infrastructure/: único lugar donde se puede importar de '.prisma/master'.
 */
import type { PedidoPublicoToken as PrismaPedidoPublicoToken } from '.prisma/master';
import { PedidoPublicoTokenEntity } from '../../../domain/entities/pedido-publico-token.entity';

export class PedidoPublicoTokenMapper {
  static toDomain(row: PrismaPedidoPublicoToken): PedidoPublicoTokenEntity {
    return PedidoPublicoTokenEntity.reconstitute(
      {
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
}
