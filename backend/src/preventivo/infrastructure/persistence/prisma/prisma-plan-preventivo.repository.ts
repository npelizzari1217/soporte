/**
 * PrismaPlanPreventivoRepository — implementación del puerto
 * IPlanPreventivoRepository.
 *
 * Reglas (mismo patrón que PrismaEquipoInformaticoRepository):
 * - Obtiene el cliente Prisma del tenant activo vía TenantContext.getClient().
 *   NUNCA recibe PrismaService ni llama a PrismaService directamente.
 * - guardar() es un upsert por id; nunca pisa `createdAt` en el UPDATE.
 * - findVencibles() es EXACTAMENTE la query del barrido (ADR-PV2/PV3):
 *   `activo AND deleted_at IS NULL AND proxima_ejecucion_en <= hoy` — cubierta
 *   por el índice parcial `planes_preventivo_proxima_ejecucion_idx` (WU-2).
 *
 * Tarea: 4.1.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IPlanPreventivoRepository } from '../../../domain/ports/i-plan-preventivo.repository';
import { PlanPreventivoEntity } from '../../../domain/entities/plan-preventivo.entity';
import { PlanPreventivoMapper } from './plan-preventivo.mapper';

@Injectable()
export class PrismaPlanPreventivoRepository implements IPlanPreventivoRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async guardar(plan: PlanPreventivoEntity): Promise<void> {
    const data = PlanPreventivoMapper.toPersistence(plan);
    const { createdAt: _createdAt, ...updateData } = data;
    await this.client.planPreventivo.upsert({
      where: { id: data.id },
      create: data,
      update: updateData,
    });
  }

  async buscarPorId(id: string): Promise<PlanPreventivoEntity | null> {
    const row = await this.client.planPreventivo.findUnique({ where: { id } });
    return row ? PlanPreventivoMapper.toDomain(row) : null;
  }

  async listar(): Promise<PlanPreventivoEntity[]> {
    const rows = await this.client.planPreventivo.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(PlanPreventivoMapper.toDomain);
  }

  async findVencibles(hoy: Date): Promise<PlanPreventivoEntity[]> {
    const rows = await this.client.planPreventivo.findMany({
      where: { activo: true, deletedAt: null, proximaEjecucionEn: { lte: hoy } },
    });
    return rows.map(PlanPreventivoMapper.toDomain);
  }

  async actualizarProximaEjecucion(planId: string, proximaEjecucionEn: Date): Promise<void> {
    await this.client.planPreventivo.update({
      where: { id: planId },
      data: { proximaEjecucionEn },
    });
  }
}
