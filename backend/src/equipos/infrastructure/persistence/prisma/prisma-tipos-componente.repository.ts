/**
 * PrismaTiposComponenteRepository — implementación del puerto ITiposComponenteRepository.
 *
 * Reglas:
 * - Obtiene el cliente Prisma del tenant activo vía TenantContext.getClient().
 *   NUNCA recibe PrismaService ni llama a PrismaService directamente.
 * - Mapea Prisma rows ↔ TipoComponenteEntity vía TipoComponenteMapper.
 * - save() es un upsert por id.
 * - findAllActive() retorna solo activo=true Y deleted_at IS NULL.
 *
 * Fitness rule: ningún import de @prisma/client ni .prisma/ fuera de infrastructure/.
 *
 * Tarea: 6.C.2
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ITiposComponenteRepository } from '../../../domain/ports/i-tipos-componente.repository';
import { TipoComponenteEntity } from '../../../domain/entities/tipos-componente.entity';
import { TipoComponenteMapper } from './tipo-componente.mapper';

@Injectable()
export class PrismaTiposComponenteRepository implements ITiposComponenteRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findById(id: string): Promise<TipoComponenteEntity | null> {
    const row = await this.client.tipoComponente.findUnique({ where: { id } });
    return row ? TipoComponenteMapper.toDomain(row) : null;
  }

  async findByCodigo(codigo: string): Promise<TipoComponenteEntity | null> {
    const row = await this.client.tipoComponente.findUnique({ where: { codigo } });
    return row ? TipoComponenteMapper.toDomain(row) : null;
  }

  async findAllActive(): Promise<TipoComponenteEntity[]> {
    const rows = await this.client.tipoComponente.findMany({
      where: { activo: true, deletedAt: null },
    });
    return rows.map(TipoComponenteMapper.toDomain);
  }

  async save(tipoComponente: TipoComponenteEntity): Promise<void> {
    const data = TipoComponenteMapper.toPersistence(tipoComponente);
    const { id, ...updateData } = data;
    await this.client.tipoComponente.upsert({
      where: { id },
      create: data,
      update: updateData,
    });
  }
}
