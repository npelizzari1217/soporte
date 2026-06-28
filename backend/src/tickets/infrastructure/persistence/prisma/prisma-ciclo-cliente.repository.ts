/**
 * PrismaCicloClienteRepository — implementación del puerto ICicloClienteRepository.
 *
 * Ciclos de gestión del tenant. El catálogo es manejado por el tenant y puede
 * incluir ciclos activos e inactivos.
 *
 * Reglas:
 * - Obtiene el cliente via TenantContext (nunca PrismaService directo).
 * - findById() incluye ciclos soft-deleted.
 * - findActive() retorna solo activo=true con deletedAt IS NULL.
 *
 * S2-T7
 */
import { Injectable } from '@nestjs/common';
import type { CicloCliente as PrismaCicloCliente } from '.prisma/tenant';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ICicloClienteRepository } from '../../../domain/ports/i-ciclo-cliente.repository';
import { CicloClienteEntity } from '../../../domain/entities/ciclo-cliente.entity';

@Injectable()
export class PrismaCicloClienteRepository implements ICicloClienteRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  /** Convierte una fila Prisma → CicloClienteEntity de dominio (mapper inline). */
  private static toDomain(row: PrismaCicloCliente): CicloClienteEntity {
    return CicloClienteEntity.reconstitute(
      {
        cicloVigenteId: row.cicloVigenteId,
        nombre: row.nombre,
        fechaInicio: row.fechaInicio,
        fechaFin: row.fechaFin,
        activo: row.activo,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  async findById(id: string): Promise<CicloClienteEntity | null> {
    const row = await this.client.cicloCliente.findUnique({ where: { id } });
    return row ? PrismaCicloClienteRepository.toDomain(row) : null;
  }

  async findActive(): Promise<CicloClienteEntity | null> {
    const row = await this.client.cicloCliente.findFirst({
      where: { activo: true, deletedAt: null },
    });
    return row ? PrismaCicloClienteRepository.toDomain(row) : null;
  }

  async findAll(): Promise<CicloClienteEntity[]> {
    const rows = await this.client.cicloCliente.findMany({
      orderBy: { fechaInicio: 'desc' },
    });
    return rows.map(PrismaCicloClienteRepository.toDomain);
  }

  async save(ciclo: CicloClienteEntity): Promise<void> {
    await this.client.cicloCliente.upsert({
      where: { id: ciclo.id },
      create: {
        id: ciclo.id,
        cicloVigenteId: ciclo.cicloVigenteId,
        nombre: ciclo.nombre,
        fechaInicio: ciclo.fechaInicio,
        fechaFin: ciclo.fechaFin,
        activo: ciclo.activo,
        createdAt: ciclo.createdAt,
        updatedAt: ciclo.updatedAt,
        deletedAt: ciclo.deletedAt,
      },
      update: {
        cicloVigenteId: ciclo.cicloVigenteId,
        nombre: ciclo.nombre,
        fechaInicio: ciclo.fechaInicio,
        fechaFin: ciclo.fechaFin,
        activo: ciclo.activo,
        updatedAt: ciclo.updatedAt,
        deletedAt: ciclo.deletedAt,
      },
    });
  }
}
