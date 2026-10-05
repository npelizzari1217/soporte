/**
 * PurgaPendientesVencidosScheduler — barrido periódico multi-tenant de los pedidos públicos
 * pendientes vencidos (sdd/formulario-publico-qr, WU-20; remedia W2 del verify-report).
 *
 * Un pendiente sin confirmar (o huérfano por una escritura fallida en master) guarda nombre, email
 * y teléfono del solicitante. Antes solo lo borraba la siguiente solicitud del MISMO tenant: un
 * cliente sin tráfico, o con el formulario apagado, lo conservaba para siempre. Este barrido no
 * depende de tráfico.
 *
 * "Thin trigger" de `@Cron` (mismo criterio que `PreventivoSweepScheduler`): la lógica de borrado
 * vive en `IPedidoPendienteRepository.purgarVencidos` (cubierta por su integración); acá solo se
 * orquesta la ENUMERACIÓN de tenants + el binding de `TenantContext` por tenant. El timing del cron
 * NO se testea, el handler (`ejecutarBarrido`) SÍ.
 *
 * Alcance: `ITenantEnumerator.listTenantsConBase` devuelve todo cliente cuya base se conserva:
 * activos, inactivos y soft-deleted. Dar de baja un cliente no dropea su base (es reversible), así
 * que sus pendientes vencidos —PII de gente que nunca confirmó— también se purgan. Alcanza además
 * a los clientes con el formulario apagado (el flag vive en master y el barrido no lo mira). SLA y
 * preventivo siguen en `listActiveTenants`: actúan sobre trabajo vivo.
 *
 * Aislamiento por tenant: un fallo en UN tenant (try/catch por iteración, log enmascarado — solo
 * `dbName` + mensaje) NUNCA aborta el barrido del resto. El log nunca lleva datos del solicitante.
 */
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { ITenantEnumerator } from '../../../shared/domain/ports/i-tenant-enumerator';
import { IPedidoPendienteRepository } from '../../domain/ports/i-pedido-pendiente.repository';

/** `P2021` de Prisma: la tabla no existe en la base. */
function esTablaInexistente(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2021';
}

@Injectable()
export class PurgaPendientesVencidosScheduler {
  constructor(
    private readonly tenantEnumerator: Pick<ITenantEnumerator, 'listTenantsConBase'>,
    private readonly tenantContext: TenantContext,
    private readonly prismaService: Pick<PrismaService, 'getTenantClient'>,
    private readonly pendienteRepo: Pick<IPedidoPendienteRepository, 'purgarVencidos'>,
    private readonly logger: Pick<ILogger, 'log' | 'error'>,
  ) {}

  /**
   * Handler del cron (default cada hora, configurable vía `PURGA_PENDIENTES_CRON`). El TTL del
   * pendiente es de 24 h: una pasada por hora deja la PII vencida a lo sumo ~1 h de más.
   */
  @Cron(process.env.PURGA_PENDIENTES_CRON ?? CronExpression.EVERY_HOUR)
  async ejecutarBarrido(): Promise<void> {
    let tenants: Awaited<ReturnType<ITenantEnumerator['listTenantsConBase']>>;
    try {
      tenants = await this.tenantEnumerator.listTenantsConBase();
    } catch (error) {
      // Sin este catch, la promesa rechazada sale de un handler `@Cron` como unhandled rejection.
      const mensaje = error instanceof Error ? error.message : 'error desconocido';
      this.logger.error(`PURGA_PENDIENTES_ERROR | enumeración de tenants falló | error=${mensaje}`);
      return;
    }

    for (const tenant of tenants) {
      try {
        const prismaClient = this.prismaService.getTenantClient(tenant.dbName);
        const borrados = await this.tenantContext.run(
          { prismaClient, dbName: tenant.dbName, clienteId: tenant.clienteId },
          () => this.pendienteRepo.purgarVencidos(),
        );
        if (borrados > 0) {
          this.logger.log(`PURGA_PENDIENTES | tenant=${tenant.dbName} | borrados=${borrados}`);
        }
      } catch (error) {
        // Un tenant dado de baja puede no tener la tabla: `migrate-tenants.js` solo migra los vivos.
        // Sin tabla no hay pendientes que purgar. En un tenant vivo, en cambio, es una migración rota.
        if (!tenant.vivo && esTablaInexistente(error)) continue;
        const mensaje = error instanceof Error ? error.message : 'error desconocido';
        this.logger.error(`PURGA_PENDIENTES_ERROR | tenant=${tenant.dbName} | error=${mensaje}`);
      }
    }
  }
}
