/**
 * PrismaSubtareaEdiliciaRepository — implementación del puerto
 * ISubtareaEdiliciaRepository.
 *
 * Tarea: T7.2.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ISubtareaEdiliciaRepository } from '../../../domain/ports/i-subtarea-edilicia.repository';
import { SubtareaEdiliciaEntity } from '../../../domain/entities/subtarea-edilicia.entity';
import { SubtareaEdiliciaMapper } from './subtarea-edilicia.mapper';

@Injectable()
export class PrismaSubtareaEdiliciaRepository implements ISubtareaEdiliciaRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findById(id: string): Promise<SubtareaEdiliciaEntity | null> {
    const row = await this.client.subtareaEdilicia.findUnique({ where: { id } });
    return row ? SubtareaEdiliciaMapper.toDomain(row) : null;
  }

  async findActiveByTicketEdiliciaId(ticketEdiliciaId: string): Promise<SubtareaEdiliciaEntity[]> {
    const rows = await this.client.subtareaEdilicia.findMany({
      where: { ticketEdiliciaId, deletedAt: null },
      orderBy: [{ orden: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(SubtareaEdiliciaMapper.toDomain);
  }

  async save(subtarea: SubtareaEdiliciaEntity): Promise<void> {
    const data = SubtareaEdiliciaMapper.toPersistence(subtarea);
    const { createdAt: _createdAt, ...updateData } = data;
    await this.client.subtareaEdilicia.upsert({
      where: { id: data.id },
      create: data,
      update: updateData,
    });
  }

  async delete(id: string): Promise<void> {
    await this.client.subtareaEdilicia.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
