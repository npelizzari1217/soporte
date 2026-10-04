/**
 * PedidoPendienteMapper — fila Prisma (TENANT) <-> PedidoPendienteEntity.
 * Vive en infrastructure/: único lugar donde se puede importar de '.prisma/tenant'.
 */
import type { PedidoPublicoPendiente as PrismaPedidoPendiente } from '.prisma/tenant';
import { PedidoPendienteEntity } from '../../../domain/entities/pedido-pendiente.entity';

export class PedidoPendienteMapper {
  static toDomain(row: PrismaPedidoPendiente): PedidoPendienteEntity {
    return PedidoPendienteEntity.reconstitute(
      {
        nombre: row.nombre,
        email: row.email,
        telefono: row.telefono ?? null,
        titulo: row.titulo,
        descripcion: row.descripcion,
        equipoId: row.equipoId ?? null,
        expiresAt: row.expiresAt,
      },
      row.id,
      row.createdAt,
    );
  }
}
