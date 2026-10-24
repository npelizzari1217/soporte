/**
 * PrismaPlanPreventivoRepository — implementación del puerto
 * IPlanPreventivoRepository.
 *
 * Reglas (mismo patrón que PrismaEquipoInformaticoRepository):
 * - Obtiene el cliente Prisma del tenant activo vía TenantContext.getClient().
 *   NUNCA recibe PrismaService ni llama a PrismaService directamente.
 * - guardar() es un upsert por id; nunca pisa `createdAt` en el UPDATE.
 * - findVencibles() es EXACTAMENTE la query del barrido (ADR-PV2/PV3):
 *   `activo AND deleted_at IS NULL AND fecha_generacion(proxima_ejecucion_en) <= hoy`
 *   (odd/preventivo-anticipacion T2). Con anticipación 0, la fecha de
 *   generación es el puntero mismo, que era la consulta original.
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

  async listar(tipoIds: readonly string[] | null): Promise<PlanPreventivoEntity[]> {
    const rows = await this.client.planPreventivo.findMany({
      where: { deletedAt: null, ...(tipoIds === null ? {} : { tipoId: { in: [...tipoIds] } }) },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(PlanPreventivoMapper.toDomain);
  }

  /**
   * Planes cuyo próximo ciclo ya tiene la generación vencida: `puntero −
   * anticipación <= hoy`. `$queryRaw` porque la resta depende de la unidad de
   * cada fila, y Prisma no expresa aritmética de fechas en un `where`.
   *
   * `date - make_interval(months => n)` resta meses con clamp a fin de mes
   * (`31/03` − 1 mes = `28/02`), el mismo criterio que
   * `CalcularCicloService.fechaGeneracion`, que es quien decide el candidato
   * con los planes que esta consulta devuelve. `hoy` viaja como su día UTC
   * (`YYYY-MM-DD`), que es contra lo que el dominio compara las columnas
   * `@db.Date` (medianoche UTC), sin depender de la zona de la sesión.
   *
   * @param hoy Instante de la corrida del barrido.
   * @returns Los planes activos, no eliminados, con la generación de su puntero vencida.
   */
  async findVencibles(hoy: Date): Promise<PlanPreventivoEntity[]> {
    const diaHoy = hoy.toISOString().slice(0, 10);
    const vencibles = await this.client.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM planes_preventivo
      WHERE activo
        AND deleted_at IS NULL
        AND (
          CASE WHEN anticipacion_unidad = 'MESES'
            THEN (proxima_ejecucion_en - make_interval(months => anticipacion_valor))::date
            ELSE proxima_ejecucion_en - anticipacion_valor
          END
        ) <= ${diaHoy}::date
    `;
    if (vencibles.length === 0) return [];
    const rows = await this.client.planPreventivo.findMany({
      where: { id: { in: vencibles.map((fila) => fila.id) } },
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
