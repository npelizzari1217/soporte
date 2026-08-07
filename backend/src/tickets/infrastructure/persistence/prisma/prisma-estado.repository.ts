/**
 * PrismaEstadoRepository — implementación del puerto IEstadoRepository.
 *
 * El catálogo de estados es sembrado en provisioning (ADR-1, 6 códigos
 * fijos). Este repo es SOLO LECTURA — ningún use case crea/modifica estados
 * (spec T1: sin endpoints de alta/baja/edición).
 *
 * Reglas:
 * - Obtiene el cliente vía TenantContext (nunca PrismaService directo).
 * - findAllActive() excluye estados soft-deleted, ordena por `orden` ASC.
 *
 * Tarea: T2.3
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

  async findIdByCodigo(codigo: string): Promise<string | null> {
    const row = await this.client.estado.findUnique({ where: { codigo }, select: { id: true } });
    return row?.id ?? null;
  }

  async findAllActive(): Promise<EstadoEntity[]> {
    const rows = await this.client.estado.findMany({
      where: { deletedAt: null },
      orderBy: { orden: 'asc' },
    });
    return rows.map(EstadoMapper.toDomain);
  }
}
