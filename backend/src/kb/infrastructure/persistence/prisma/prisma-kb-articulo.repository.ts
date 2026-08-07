/**
 * PrismaKbArticuloRepository — implementación del puerto IKbArticuloRepository.
 *
 * Reglas:
 * - Obtiene el cliente vía TenantContext (nunca PrismaService directo).
 * - `save()` es upsert por id: INSERT si es nuevo, UPDATE si ya existe.
 * - `findAll()` combina filtros (AND): `soloVisibles` → `visibleParaSolicitante:true`;
 *   `incluirInactivos=false` → excluye soft-deleted Y `activo=false`;
 *   `busqueda` → ILIKE case-insensitive en `titulo` (K3/K5).
 * - `softDelete()` setea `deletedAt` + `activo=false` en una sola escritura
 *   (consistente con `KbArticuloEntity.eliminar()`).
 *
 * Tarea: K6.
 */
import { Injectable } from '@nestjs/common';
import type { Prisma } from '.prisma/tenant';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IKbArticuloRepository, KbFiltros } from '../../../domain/ports/i-kb-articulo.repository';
import { KbArticuloEntity } from '../../../domain/entities/kb-articulo.entity';
import { KbArticuloMapper } from './kb-articulo.mapper';

@Injectable()
export class PrismaKbArticuloRepository implements IKbArticuloRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findById(id: string): Promise<KbArticuloEntity | null> {
    const row = await this.client.kbArticulo.findUnique({ where: { id } });
    return row ? KbArticuloMapper.toDomain(row) : null;
  }

  async findAll(filtros: KbFiltros): Promise<{ items: KbArticuloEntity[]; total: number }> {
    const where: Prisma.KbArticuloWhereInput = {
      ...(filtros.soloVisibles ? { visibleParaSolicitante: true } : {}),
      ...(filtros.incluirInactivos ? {} : { deletedAt: null, activo: true }),
      ...(filtros.tipoTicketId ? { tipoTicketId: filtros.tipoTicketId } : {}),
      ...(filtros.busqueda
        ? { titulo: { contains: filtros.busqueda, mode: 'insensitive' as const } }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.client.kbArticulo.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filtros.page - 1) * filtros.pageSize,
        take: filtros.pageSize,
      }),
      this.client.kbArticulo.count({ where }),
    ]);

    return { items: rows.map(KbArticuloMapper.toDomain), total };
  }

  async save(articulo: KbArticuloEntity): Promise<void> {
    const data = KbArticuloMapper.toPersistence(articulo);
    const { createdAt: _createdAt, ...updateData } = data;
    await this.client.kbArticulo.upsert({
      where: { id: data.id },
      create: data,
      update: updateData,
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.client.kbArticulo.update({
      where: { id },
      data: { deletedAt: new Date(), activo: false },
    });
  }
}
