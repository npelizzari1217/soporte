/**
 * PrismaPrioridadRepository — implementación del puerto IPrioridadRepository.
 *
 * El catálogo de prioridades es sembrado en provisioning (4 códigos fijos).
 * Este repo es SOLO LECTURA.
 *
 * Reglas:
 * - Obtiene el cliente vía TenantContext (nunca PrismaService directo).
 * - findAllActive() excluye prioridades soft-deleted, ordena por `orden` ASC.
 *
 * Tarea: T2.3
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IPrioridadRepository } from '../../../domain/ports/i-prioridad.repository';
import { PrioridadEntity } from '../../../domain/entities/prioridad.entity';
import { PrioridadMapper } from './prioridad.mapper';

@Injectable()
export class PrismaPrioridadRepository implements IPrioridadRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findById(id: string): Promise<PrioridadEntity | null> {
    const row = await this.client.prioridad.findUnique({ where: { id } });
    return row ? PrioridadMapper.toDomain(row) : null;
  }

  async findByCodigo(codigo: string): Promise<PrioridadEntity | null> {
    const row = await this.client.prioridad.findUnique({ where: { codigo } });
    return row ? PrioridadMapper.toDomain(row) : null;
  }

  async findIdByCodigo(codigo: string): Promise<string | null> {
    const row = await this.client.prioridad.findUnique({ where: { codigo }, select: { id: true } });
    return row?.id ?? null;
  }

  async findAllActive(): Promise<PrioridadEntity[]> {
    const rows = await this.client.prioridad.findMany({
      where: { deletedAt: null },
      orderBy: { orden: 'asc' },
    });
    return rows.map(PrioridadMapper.toDomain);
  }

  /**
   * Upsert por id (T11.2, PR11): INSERT si es nuevo, UPDATE si existe.
   * Nunca pisa `createdAt` en el UPDATE.
   */
  async save(prioridad: PrioridadEntity): Promise<void> {
    const data = PrioridadMapper.toPersistence(prioridad);
    const { createdAt: _createdAt, ...updateData } = data;
    await this.client.prioridad.upsert({
      where: { id: data.id },
      create: data,
      update: updateData,
    });
  }
}
