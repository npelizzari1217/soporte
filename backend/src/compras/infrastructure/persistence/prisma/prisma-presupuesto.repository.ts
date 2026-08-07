/**
 * PrismaPresupuestoRepository — implementación del puerto
 * IPresupuestoRepository.
 *
 * `findSelectedByTicketCompraId` es usado por `SeleccionarPresupuestoUseCase`
 * (ADR-7) para el swap atómico — DEBE reflejar solo activos
 * (`deleted_at IS NULL`).
 *
 * Tarea: T3.2.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IPresupuestoRepository } from '../../../domain/ports/i-presupuesto.repository';
import { PresupuestoEntity } from '../../../domain/entities/presupuesto.entity';
import { PresupuestoMapper } from './presupuesto.mapper';

@Injectable()
export class PrismaPresupuestoRepository implements IPresupuestoRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findById(id: string): Promise<PresupuestoEntity | null> {
    const row = await this.client.presupuesto.findUnique({ where: { id } });
    return row ? PresupuestoMapper.toDomain(row) : null;
  }

  async findByTicketCompraId(ticketCompraId: string): Promise<PresupuestoEntity[]> {
    const rows = await this.client.presupuesto.findMany({
      where: { ticketCompraId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(PresupuestoMapper.toDomain);
  }

  async findSelectedByTicketCompraId(ticketCompraId: string): Promise<PresupuestoEntity | null> {
    const row = await this.client.presupuesto.findFirst({
      where: { ticketCompraId, seleccionado: true, deletedAt: null },
    });
    return row ? PresupuestoMapper.toDomain(row) : null;
  }

  async save(presupuesto: PresupuestoEntity): Promise<void> {
    const data = PresupuestoMapper.toPersistence(presupuesto);
    const { createdAt: _createdAt, ...updateData } = data;
    await this.client.presupuesto.upsert({
      where: { id: data.id },
      create: data,
      update: updateData,
    });
  }

  async delete(id: string): Promise<void> {
    await this.client.presupuesto.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
