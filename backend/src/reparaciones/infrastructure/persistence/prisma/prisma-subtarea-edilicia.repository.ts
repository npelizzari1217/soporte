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

  /**
   * UN solo `findMany` acotado por los ids del lote + agrupado en memoria.
   *
   * `where` y `orderBy` son los MISMOS que los de la versión de un solo id: el
   * filtro de activas y el orden `orden ASC, created_at ASC` son parte del
   * contrato del puerto, no un detalle de esta consulta. Postgres devuelve una
   * única lista globalmente ordenada; al recorrerla en ese orden y hacer un
   * `push` por fila, cada grupo queda con una subsecuencia de esa lista, o sea
   * con el orden intacto dentro de cada reparación.
   */
  async findActiveByTicketEdiliciaIds(
    ticketEdiliciaIds: string[],
  ): Promise<Map<string, SubtareaEdiliciaEntity[]>> {
    // Cortar acá y no delegar en Prisma: un `IN ()` vacío es una ida a la base
    // cuyo resultado ya conocemos.
    if (ticketEdiliciaIds.length === 0) {
      return new Map();
    }

    const rows = await this.client.subtareaEdilicia.findMany({
      where: { ticketEdiliciaId: { in: ticketEdiliciaIds }, deletedAt: null },
      orderBy: [{ orden: 'asc' }, { createdAt: 'asc' }],
    });

    const porReparacion = new Map<string, SubtareaEdiliciaEntity[]>();
    for (const row of rows) {
      const subtareas = porReparacion.get(row.ticketEdiliciaId);
      if (subtareas === undefined) {
        porReparacion.set(row.ticketEdiliciaId, [SubtareaEdiliciaMapper.toDomain(row)]);
      } else {
        subtareas.push(SubtareaEdiliciaMapper.toDomain(row));
      }
    }
    return porReparacion;
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
