/**
 * PrismaPedidoPendienteRepository — implementación de IPedidoPendienteRepository (TENANT).
 *
 * El cliente sale de TenantContext: dentro de `txRunner.run` es el cliente transaccional, así que
 * `consumir` participa de esa transacción y un ROLLBACK restaura la fila.
 *
 * `consumir` usa SQL crudo porque Prisma `delete()` lanza P2025 si la fila no existe y no hay
 * `deleteMany` con RETURNING: `DELETE ... RETURNING` es la sentencia atómica que serializa dos
 * confirmaciones concurrentes sobre la fila (la segunda recibe 0 filas).
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IPedidoPendienteRepository } from '../../../domain/ports/i-pedido-pendiente.repository';
import { PedidoPendienteEntity } from '../../../domain/entities/pedido-pendiente.entity';
import { PedidoPendienteMapper } from './pedido-pendiente.mapper';

interface FilaPendiente {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  titulo: string;
  descripcion: string;
  equipoId: string | null;
  expiresAt: Date;
  createdAt: Date;
}

@Injectable()
export class PrismaPedidoPendienteRepository implements IPedidoPendienteRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async save(pedido: PedidoPendienteEntity): Promise<void> {
    await this.client.pedidoPublicoPendiente.create({
      data: {
        id: pedido.id,
        nombre: pedido.nombre,
        email: pedido.email,
        telefono: pedido.telefono,
        titulo: pedido.titulo,
        descripcion: pedido.descripcion,
        equipoId: pedido.equipoId,
        expiresAt: pedido.expiresAt,
        createdAt: pedido.createdAt,
      },
    });
  }

  async consumir(id: string): Promise<PedidoPendienteEntity | null> {
    const filas = await this.client.$queryRaw<FilaPendiente[]>`
      DELETE FROM pedidos_publicos_pendientes
      WHERE id = ${id}::uuid
      RETURNING id, nombre, email, telefono, titulo, descripcion,
                equipo_id AS "equipoId", expires_at AS "expiresAt", created_at AS "createdAt"
    `;
    return filas[0] ? PedidoPendienteMapper.toDomain(filas[0]) : null;
  }

  async purgarVencidos(ahora: Date = new Date()): Promise<number> {
    const result = await this.client.pedidoPublicoPendiente.deleteMany({
      where: { expiresAt: { lte: ahora } },
    });
    return result.count;
  }
}
