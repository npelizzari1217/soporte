/**
 * PrismaEstadoRepository — implementación del puerto IEstadoRepository.
 *
 * El catálogo de estados es sembrado en provisioning. Este repo es solo lectura
 * para los use cases (ningún use case crea/modifica estados directamente).
 *
 * Reglas:
 * - Obtiene el cliente via TenantContext (nunca PrismaService directo).
 * - findAllActive() excluye estados soft-deleted, ordena por `orden` ASC.
 * - findAll() incluye estados soft-deleted.
 *
 * Tarea: 3.D.2
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IEstadoRepository } from '../../../domain/ports/i-estado.repository';
import { EstadoEntity } from '../../../domain/entities/estado.entity';
import { EstadoMapper } from './estado.mapper';

@Injectable()
export class PrismaEstadoRepository implements IEstadoRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findById(id: string): Promise<EstadoEntity | null> {
    const row = await this.client.estado.findUnique({ where: { id } });
    return row ? EstadoMapper.toDomain(row) : null;
  }

  async findByCodigo(codigo: string): Promise<EstadoEntity | null> {
    const row = await this.client.estado.findUnique({ where: { codigo } });
    return row ? EstadoMapper.toDomain(row) : null;
  }

  async findAllActive(): Promise<EstadoEntity[]> {
    const rows = await this.client.estado.findMany({
      where: { deletedAt: null },
      orderBy: { orden: 'asc' },
    });
    return rows.map(EstadoMapper.toDomain);
  }

  async findAll(): Promise<EstadoEntity[]> {
    const rows = await this.client.estado.findMany({
      orderBy: { orden: 'asc' },
    });
    return rows.map(EstadoMapper.toDomain);
  }
}
