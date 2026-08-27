/**
 * PreventivoSweepScheduler — barrido periódico multi-tenant de generación de
 * mantenimiento preventivo (WU-5). "Thin trigger" de `@Cron` (ADR-P3, mismo
 * criterio que `SlaSweepScheduler`): la lógica de negocio vive en
 * `GenerarPreventivosUseCase` (testeable sin cron); acá solo se orquesta la
 * ENUMERACIÓN de tenants + el binding de `TenantContext` por tenant — el
 * timing del cron NO se testea, el handler (`ejecutarBarrido`) SÍ,
 * invocándolo directamente.
 *
 * Aislamiento por tenant [R10]: un fallo en UN tenant (try/catch por
 * iteración, log enmascarado — no se vuelca el objeto de error crudo, solo
 * `dbName` + `mensaje`) NUNCA aborta el barrido del resto. El aislamiento
 * POR PLAN dentro de un mismo tenant es responsabilidad de
 * `GenerarPreventivosUseCase`.
 *
 * Ref spec: sdd/preventivo/spec, Requirement "Aislamiento por tenant en el
 * barrido". Ref design: flujo de datos (ADR-PV3), ADR-P3. Tarea: 5.6/5.7.
 */
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { ITenantEnumerator } from '../../../shared/domain/ports/i-tenant-enumerator';
import { GenerarPreventivosUseCase } from '../../application/use-cases/generar-preventivos.use-case';

@Injectable()
export class PreventivoSweepScheduler {
  constructor(
    private readonly tenantEnumerator: Pick<ITenantEnumerator, 'listActiveTenants'>,
    private readonly tenantContext: TenantContext,
    private readonly prismaService: Pick<PrismaService, 'getTenantClient'>,
    private readonly generarPreventivosUseCase: Pick<GenerarPreventivosUseCase, 'execute'>,
    private readonly logger: Pick<ILogger, 'error'>,
  ) {}

  /**
   * Handler del cron (default diario a la 1am, configurable vía
   * `PREVENTIVO_SWEEP_CRON`). Recorre TODOS los clientes activos
   * (`ITenantEnumerator`) y ejecuta `GenerarPreventivosUseCase` dentro de
   * `TenantContext.run()` bindeado a cada uno — un fallo por-tenant se aísla
   * y se continúa con el resto [R10].
   */
  @Cron(process.env.PREVENTIVO_SWEEP_CRON ?? CronExpression.EVERY_DAY_AT_1AM)
  async ejecutarBarrido(): Promise<void> {
    let tenants: Awaited<ReturnType<ITenantEnumerator['listActiveTenants']>>;
    try {
      tenants = await this.tenantEnumerator.listActiveTenants();
    } catch (error) {
      // La enumeración corre FUERA del try/catch por-tenant de abajo — si
      // la master DB falla acá, no hay ningún tenant que aislar todavía.
      // Sin este catch, la promesa rechazada sale de un handler `@Cron`:
      // unhandled rejection, sin log, sin PREVENTIVO_SWEEP_ERROR. El
      // barrido termina sin procesar nada, pero LOGUEADO (mismo criterio de
      // log enmascarado que el catch por-tenant de abajo).
      const mensaje = error instanceof Error ? error.message : 'error desconocido';
      this.logger.error(`PREVENTIVO_SWEEP_ERROR | enumeración de tenants falló | error=${mensaje}`);
      return;
    }

    for (const tenant of tenants) {
      try {
        const prismaClient = this.prismaService.getTenantClient(tenant.dbName);
        await this.tenantContext.run(
          { prismaClient, dbName: tenant.dbName, clienteId: tenant.clienteId },
          () => this.generarPreventivosUseCase.execute(tenant.clienteId),
        );
      } catch (error) {
        // Aislamiento por tenant [R10]: un fallo acá NUNCA aborta el resto
        // del barrido. Va por `error()` y no por `log()`: un tenant entero
        // que se cae es degradación silenciosa, y el puerto `ILogger` reserva
        // `log()` para auditoría del camino de éxito. (`SlaSweepScheduler`
        // usa `log()` acá; es el precedente que se copió, y está mal por el
        // mismo motivo — queda fuera del alcance de este WU.)
        //
        // Log enmascarado: solo dbName + mensaje, sin volcar el objeto de
        // error crudo, que podría traer datos de conexión.
        const mensaje = error instanceof Error ? error.message : 'error desconocido';
        this.logger.error(`PREVENTIVO_SWEEP_ERROR | tenant=${tenant.dbName} | error=${mensaje}`);
      }
    }
  }
}
