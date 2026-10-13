import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ILogger } from '../../shared/domain/ports/i-logger.port';
import { ITenantEnumerator } from '../../shared/domain/ports/i-tenant-enumerator';
import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../shared/tenancy/tenant-context';
import { EnviarWebhooksPendientesUseCase } from '../application/enviar-webhooks-pendientes.use-case';

/**
 * WebhookEnvioScheduler — barrido periódico multi-tenant que envía los avisos de webhook vencidos y
 * purga el registro viejo (odd/webhooks, T5). "Thin trigger" de `@Cron`, con el patrón de
 * `SlaSweepScheduler`: la lógica vive en `EnviarWebhooksPendientesUseCase`; acá solo se enumeran los
 * inquilinos activos y se bindea el `TenantContext` de cada uno. Un fallo en un inquilino se
 * registra (solo `dbName` y el mensaje) y no frena al resto.
 *
 * Sin barridos superpuestos (nota (c) de T5): `tomarVencidas` no reserva filas, así que dos
 * barridos a la vez enviarían dos veces la misma entrega y consumirían dos intentos. El candado es
 * un flag en memoria: alcanza porque el backend corre como UN solo proceso (como el throttler en
 * memoria de la API `v1`). Al escalar horizontal hará falta un candado en la base.
 */
@Injectable()
export class WebhookEnvioScheduler {
  private enCurso = false;

  constructor(
    private readonly tenantEnumerator: Pick<ITenantEnumerator, 'listActiveTenants'>,
    private readonly tenantContext: Pick<TenantContext, 'run'>,
    private readonly prismaService: Pick<PrismaService, 'getTenantClient'>,
    private readonly enviarWebhooks: Pick<EnviarWebhooksPendientesUseCase, 'ejecutar'>,
    private readonly logger: Pick<ILogger, 'error'>,
  ) {}

  /**
   * Handler del cron: cada minuto por defecto, configurable con `WEBHOOK_SWEEP_CRON`.
   * `WEBHOOK_SWEEP_HABILITADO=false` lo apaga (la suite de tests lo apaga: ningún e2e envía avisos
   * reales). Si el barrido anterior sigue corriendo, este no hace nada.
   */
  @Cron(process.env.WEBHOOK_SWEEP_CRON ?? CronExpression.EVERY_MINUTE, {
    name: 'webhook-envio',
    disabled: process.env.WEBHOOK_SWEEP_HABILITADO === 'false',
  })
  async ejecutarBarrido(): Promise<void> {
    if (this.enCurso) return;
    this.enCurso = true;
    try {
      await this.barrer();
    } finally {
      this.enCurso = false;
    }
  }

  private async barrer(): Promise<void> {
    let tenants: Awaited<ReturnType<ITenantEnumerator['listActiveTenants']>>;
    try {
      tenants = await this.tenantEnumerator.listActiveTenants();
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'error desconocido';
      this.logger.error(`WEBHOOK_SWEEP_ERROR | enumeración de tenants falló | error=${mensaje}`);
      return;
    }

    for (const tenant of tenants) {
      try {
        const prismaClient = this.prismaService.getTenantClient(tenant.dbName);
        await this.tenantContext.run(
          { prismaClient, dbName: tenant.dbName, clienteId: tenant.clienteId },
          () => this.enviarWebhooks.ejecutar(tenant.clienteId),
        );
      } catch (error) {
        // Log enmascarado: solo dbName + mensaje, sin el error crudo (puede traer datos de conexión).
        const mensaje = error instanceof Error ? error.message : 'error desconocido';
        this.logger.error(`WEBHOOK_SWEEP_ERROR | tenant=${tenant.dbName} | error=${mensaje}`);
      }
    }
  }
}
