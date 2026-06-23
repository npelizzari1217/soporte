/**
 * PrismaSubtareaEdiliciaRepository — implementación del puerto ISubtareaEdiliciaRepository.
 *
 * Reglas:
 * - Obtiene el cliente Prisma del tenant activo vía TenantContext.getClient().
 *   NUNCA recibe PrismaService ni llama a PrismaService directamente.
 * - Mapea Prisma rows ↔ SubtareaEdiliciaEntity vía SubtareaEdiliciaMapper.
 * - save() es un upsert por id.
 * - delete() es soft delete: setea deleted_at = now().
 * - findActiveByTicketEdiliciaId() excluye soft-deleted (deleted_at IS NULL).
 *   CRÍTICO: las subtareas soft-deleted NO deben contar en el recálculo de avance.
 * - findAllByTicketEdiliciaId() retorna TODAS (incluye soft-deleted) para timeline.
 *
 * Fitness rule: ningún import de @prisma/client ni .prisma/ fuera de infrastructure/.
 *
 * Tarea: 5.C.2
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

  async findActiveByTicketEdiliciaId(
    ticketEdiliciaId: string,
  ): Promise<SubtareaEdiliciaEntity[]> {
    // SOLO subtareas con deleted_at IS NULL — las soft-deleted NO cuentan en el avance.
    // Ordenadas por orden ASC, created_at ASC (spec: fórmula de avance).
    const rows = await this.client.subtareaEdilicia.findMany({
      where: { ticketEdiliciaId, deletedAt: null },
      orderBy: [{ orden: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(SubtareaEdiliciaMapper.toDomain);
  }

  async findAllByTicketEdiliciaId(
    ticketEdiliciaId: string,
  ): Promise<SubtareaEdiliciaEntity[]> {
    // Retorna TODAS las subtareas (incluye soft-deleted) para trazabilidad de timeline.
    const rows = await this.client.subtareaEdilicia.findMany({
      where: { ticketEdiliciaId },
      orderBy: [{ orden: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(SubtareaEdiliciaMapper.toDomain);
  }

  async save(subtarea: SubtareaEdiliciaEntity): Promise<void> {
    const data = SubtareaEdiliciaMapper.toPersistence(subtarea);
    const { id, ...updateData } = data;
    await this.client.subtareaEdilicia.upsert({
      where: { id },
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
