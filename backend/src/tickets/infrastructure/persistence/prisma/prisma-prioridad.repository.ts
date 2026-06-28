/**
 * PrismaPrioridadRepository — implementación del puerto IPrioridadRepository.
 *
 * Catálogo de prioridades del tenant. Se usa para validar FK (prioridadId)
 * en EditarTicketUseCase antes de persistir el cambio (locked decision L4).
 *
 * Reglas:
 * - Obtiene el cliente via TenantContext (nunca PrismaService directo).
 * - findById() incluye prioridades soft-deleted (la validación solo verifica existencia).
 *
 * S2-T9
 */
import { Injectable } from '@nestjs/common';
import type { Prioridad as PrismaPrioridad } from '.prisma/tenant';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IPrioridadRepository } from '../../../domain/ports/i-prioridad.repository';
import { PrioridadEntity } from '../../../domain/entities/prioridad.entity';

@Injectable()
export class PrismaPrioridadRepository implements IPrioridadRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  /** Convierte una fila Prisma → PrioridadEntity de dominio (mapper inline). */
  private static toDomain(row: PrismaPrioridad): PrioridadEntity {
    return PrioridadEntity.reconstitute(
      {
        codigo: row.codigo,
        nombre: row.nombre,
        color: row.color ?? null,
        orden: row.orden,
        activo: row.activo,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  async findById(id: string): Promise<PrioridadEntity | null> {
    const row = await this.client.prioridad.findUnique({ where: { id } });
    return row ? PrismaPrioridadRepository.toDomain(row) : null;
  }
}
