/**
 * SlaSweepScheduler — barrido periódico multi-tenant de vencimiento de SLA
 * (S4, S5). "Thin trigger" de `@Cron` (ADR-P3): la lógica de negocio del
 * marcado vive en `MarcarVencidosUseCase` (testeable sin cron); acá solo se
 * orquesta la ENUMERACIÓN de tenants + el binding de `TenantContext` por
 * tenant — el timing del cron NO se testea, el handler (`ejecutarBarrido`)
 * SÍ, invocándolo directamente.
 *
 * Aislamiento (S5): un fallo en UN tenant (try/catch por iteración, log
 * enmascarado — no se expone el error crudo, solo `dbName` + mensaje) NUNCA
 * aborta el barrido del resto.
 *
 * Ref spec: sdd/premium/spec S4, S5. Ref design: ADR-P3. Tarea: SB5/SB6.
 */
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { ITenantEnumerator } from '../../domain/ports/i-tenant-enumerator';
import { MarcarVencidosUseCase } from '../../application/use-cases/marcar-vencidos.use-case';

@Injectable()
export class SlaSweepScheduler {
  constructor(
    private readonly tenantEnumerator: Pick<ITenantEnumerator, 'listActiveTenants'>,
    private readonly tenantContext: TenantContext,
    private readonly prismaService: Pick<PrismaService, 'getTenantClient'>,
    private readonly marcarVencidosUseCase: Pick<MarcarVencidosUseCase, 'execute'>,
    private readonly logger: ILogger,
  ) {}

  /**
   * Handler del cron (default cada 5 min, configurable vía `SLA_SWEEP_CRON`).
   * Recorre TODOS los clientes activos (`ITenantEnumerator`) y ejecuta
   * `MarcarVencidosUseCase` dentro de `TenantContext.run()` bindeado a cada
   * uno — un fallo por-tenant se aísla y se continúa con el resto (S5).
   */
  @Cron(process.env.SLA_SWEEP_CRON ?? CronExpression.EVERY_5_MINUTES)
  async ejecutarBarrido(): Promise<void> {
    const tenants = await this.tenantEnumerator.listActiveTenants();

    for (const tenant of tenants) {
      try {
        const prismaClient = this.prismaService.getTenantClient(tenant.dbName);
        await this.tenantContext.run(
          { prismaClient, dbName: tenant.dbName, clienteId: tenant.clienteId },
          () => this.marcarVencidosUseCase.execute(),
        );
      } catch (error) {
        // Aislamiento por tenant (S5): un fallo acá NUNCA aborta el resto
        // del barrido. Log enmascarado: solo dbName + mensaje del error,
        // sin volcar el objeto de error crudo (podría contener datos de
        // conexión sensibles).
        const mensaje = error instanceof Error ? error.message : 'error desconocido';
        this.logger.log(`SLA_SWEEP_ERROR | tenant=${tenant.dbName} | error=${mensaje}`);
      }
    }
  }
}
