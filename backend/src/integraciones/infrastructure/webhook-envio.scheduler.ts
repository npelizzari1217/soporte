import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ILogger } from '../../shared/domain/ports/i-logger.port';
import { ITenantEnumerator, TenantActivo } from '../../shared/domain/ports/i-tenant-enumerator';
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
 * Sin barridos superpuestos POR INQUILINO (nota (c) de T5): `tomarVencidas` no reserva filas, así
 * que dos barridos del mismo inquilino a la vez enviarían dos veces la misma entrega y consumirían
 * dos intentos. El candado es un conjunto en memoria de `clienteId` en curso (el id de master es
 * estable; el `dbName` cambia si el inquilino se recrea): alcanza porque el backend corre como UN
 * solo proceso (como el throttler en memoria de la API `v1`). Al escalar horizontal hará falta un
 * candado en la base.
 *
 * Cada tick arranca a la vez el barrido de todo inquilino que no tenga uno en curso, sin esperar a
 * los demás (JD-3, T10): un destino colgado retiene solo a su inquilino. No hay tope de concurrencia
 * propio: la acota la cantidad de inquilinos activos (8 hoy), y cada barrido envía en serie.
 */
@Injectable()
export class WebhookEnvioScheduler {
  private readonly enCurso = new Set<string>();

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
   * reales). Arranca el barrido de cada inquilino que no tenga uno en curso y espera a los que
   * arrancó; un inquilino con su barrido anterior todavía corriendo se saltea en este tick.
   */
  @Cron(process.env.WEBHOOK_SWEEP_CRON ?? CronExpression.EVERY_MINUTE, {
    name: 'webhook-envio',
    disabled: process.env.WEBHOOK_SWEEP_HABILITADO === 'false',
  })
  async ejecutarBarrido(): Promise<void> {
    let tenants: Awaited<ReturnType<ITenantEnumerator['listActiveTenants']>>;
    try {
      tenants = await this.tenantEnumerator.listActiveTenants();
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'error desconocido';
      this.logger.error(`WEBHOOK_SWEEP_ERROR | enumeración de tenants falló | error=${mensaje}`);
      return;
    }

    const libres = tenants.filter((tenant) => !this.enCurso.has(tenant.clienteId));
    // El candado se toma en forma síncrona, antes de cualquier await: un tick que llegue mientras
    // tanto ya lo ve tomado.
    for (const tenant of libres) this.enCurso.add(tenant.clienteId);
    await Promise.all(libres.map((tenant) => this.barrerTenant(tenant)));
  }

  /** Barrido de un inquilino: nunca rechaza, y siempre libera su candado. */
  private async barrerTenant(tenant: TenantActivo): Promise<void> {
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
    } finally {
      this.enCurso.delete(tenant.clienteId);
    }
  }
}
