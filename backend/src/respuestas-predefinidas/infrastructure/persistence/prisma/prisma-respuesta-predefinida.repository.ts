/**
 * PrismaRespuestaPredefinidaRepository — implementación del puerto
 * IRespuestaPredefinidaRepository. Obtiene el cliente vía TenantContext (nunca PrismaService
 * directo).
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IRespuestaPredefinidaRepository } from '../../../domain/ports/i-respuesta-predefinida.repository';
import { RespuestaPredefinidaEntity } from '../../../domain/entities/respuesta-predefinida.entity';
import { RespuestaPredefinidaMapper } from './respuesta-predefinida.mapper';

@Injectable()
export class PrismaRespuestaPredefinidaRepository implements IRespuestaPredefinidaRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findById(id: string): Promise<RespuestaPredefinidaEntity | null> {
    const row = await this.client.respuestaPredefinida.findUnique({ where: { id } });
    return row ? RespuestaPredefinidaMapper.toDomain(row) : null;
  }

  /** Comparación insensible a mayúsculas: espeja el índice único sobre `lower(titulo)`. */
  async findByTitulo(titulo: string): Promise<RespuestaPredefinidaEntity | null> {
    const row = await this.client.respuestaPredefinida.findFirst({
      where: { titulo: { equals: titulo, mode: 'insensitive' } },
    });
    return row ? RespuestaPredefinidaMapper.toDomain(row) : null;
  }

  async findAll(soloActivas: boolean): Promise<RespuestaPredefinidaEntity[]> {
    const rows = await this.client.respuestaPredefinida.findMany({
      where: soloActivas ? { activo: true } : undefined,
      orderBy: { titulo: 'asc' },
    });
    return rows.map(RespuestaPredefinidaMapper.toDomain);
  }

  /** Upsert por id: INSERT si es nueva, UPDATE si existe. Nunca pisa `createdAt` en el UPDATE. */
  async save(respuesta: RespuestaPredefinidaEntity): Promise<void> {
    const data = RespuestaPredefinidaMapper.toPersistence(respuesta);
    const { createdAt: _createdAt, ...updateData } = data;
    await this.client.respuestaPredefinida.upsert({
      where: { id: data.id },
      create: data,
      update: updateData,
    });
  }
}
