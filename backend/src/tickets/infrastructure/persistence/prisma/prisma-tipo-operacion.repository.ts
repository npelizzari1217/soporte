/**
 * PrismaTipoOperacionRepository — implementación del puerto ITipoOperacionRepository.
 *
 * Catálogo FIJO (5 códigos: CAMBIO_ESTADO, COMENTARIO, ASIGNACION, ADJUNTO,
 * AVANCE_EDILICIO), sembrado en provisioning. Este repo es SOLO LECTURA.
 *
 * Reglas:
 * - Obtiene el cliente vía TenantContext (nunca PrismaService directo).
 * - findAllActive() excluye tipos soft-deleted.
 *
 * Tarea: T2.3
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ITipoOperacionRepository } from '../../../domain/ports/i-tipo-operacion.repository';
import { TipoOperacionEntity } from '../../../domain/entities/tipo-operacion.entity';
import { TipoOperacionMapper } from './tipo-operacion.mapper';

@Injectable()
export class PrismaTipoOperacionRepository implements ITipoOperacionRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findByCodigo(codigo: string): Promise<TipoOperacionEntity | null> {
    const row = await this.client.tipoOperacion.findUnique({ where: { codigo } });
    return row ? TipoOperacionMapper.toDomain(row) : null;
  }

  async findIdByCodigo(codigo: string): Promise<string | null> {
    const row = await this.client.tipoOperacion.findUnique({
      where: { codigo },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async findAllActive(): Promise<TipoOperacionEntity[]> {
    const rows = await this.client.tipoOperacion.findMany({
      where: { deletedAt: null },
      orderBy: { codigo: 'asc' },
    });
    return rows.map(TipoOperacionMapper.toDomain);
  }
}
