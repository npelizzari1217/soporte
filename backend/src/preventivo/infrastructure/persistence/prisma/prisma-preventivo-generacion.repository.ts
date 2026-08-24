/**
 * PrismaPreventivoGeneracionRepository — implementación del puerto
 * IPreventivoGeneracionRepository (WU-3).
 *
 * ALCANCE DE WU-4: solo `listarPorPlan()` se consume (vista de auditoría del
 * ABM, `ListarGeneracionesPlanUseCase`, tarea 4.4). Los métodos
 * `reservar`/`marcarGenerado`/`marcarSalteadoPendiente`/`registrarSalteadoAtraso`
 * están implementados acá porque TypeScript exige satisfacer la interfaz
 * completa para que la clase compile, y su SQL ya está 100% especificado por
 * ADR-PV2/ADR-PV3 (WU-3/design) sin ninguna decisión nueva — pero NINGUNO de
 * los cuatro está wireado a un use case, scheduler, ni provider de
 * generación en este WU. La orquestación transaccional del ciclo (BEGIN →
 * `reservar` → regla de pendiente → `CrearTicketUseCase` → `marcarGenerado`
 * → avance de puntero → COMMIT) es WU-5 — reusar este adaptador ahí, no
 * reimplementarlo.
 *
 * Tarea: 4.4 (habilitador), WU-5 (reserva del resto).
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import {
  IPreventivoGeneracionRepository,
  PreventivoGeneracionProps,
  ResultadoGeneracion,
} from '../../../domain/ports/i-preventivo-generacion.repository';

@Injectable()
export class PrismaPreventivoGeneracionRepository implements IPreventivoGeneracionRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async reservar(planId: string, fechaProgramada: Date): Promise<string | null> {
    const rows = await this.client.$queryRaw<{ id: string }[]>`
      INSERT INTO preventivo_generacion (plan_id, fecha_programada, resultado)
      VALUES (${planId}::uuid, ${fechaProgramada}::date, 'RESERVADO')
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    return rows[0]?.id ?? null;
  }

  async marcarGenerado(id: string, ticketId: string): Promise<void> {
    await this.client.preventivoGeneracion.update({
      where: { id },
      data: { resultado: 'GENERADO', ticketId },
    });
  }

  async marcarSalteadoPendiente(id: string): Promise<void> {
    await this.client.preventivoGeneracion.update({
      where: { id },
      data: { resultado: 'SALTEADO_PENDIENTE' },
    });
  }

  async registrarSalteadoAtraso(planId: string, fechaProgramada: Date): Promise<void> {
    await this.client.$executeRaw`
      INSERT INTO preventivo_generacion (plan_id, fecha_programada, resultado)
      VALUES (${planId}::uuid, ${fechaProgramada}::date, 'SALTEADO_ATRASO')
      ON CONFLICT DO NOTHING
    `;
  }

  async listarPorPlan(planId: string): Promise<PreventivoGeneracionProps[]> {
    const rows = await this.client.preventivoGeneracion.findMany({
      where: { planId },
      orderBy: { fechaProgramada: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      planId: row.planId,
      fechaProgramada: row.fechaProgramada,
      resultado: row.resultado as ResultadoGeneracion,
      ticketId: row.ticketId ?? null,
      createdAt: row.createdAt,
    }));
  }
}
