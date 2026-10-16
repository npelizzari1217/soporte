/**
 * SB5 [UNIT] — RED→GREEN: SlaSweepScheduler (S5 — barrido multi-tenant).
 *
 * "Aislamiento del scheduler en tests" (ADR-P3): se instancia la clase
 * DIRECTAMENTE y se invoca `ejecutarBarrido()` a mano — NO se testea el
 * timing del `@Cron` (eso requeriría un reloj real/fake-timers de NestJS
 * Schedule, fuera de alcance). Se testea el HANDLER: enumera tenants activos,
 * corre `MarcarVencidosUseCase` dentro de `tenantContext.run()` por cada uno,
 * y aísla el fallo de un tenant sin abortar el resto.
 *
 * Ref spec: sdd/premium/spec S5. Ref design: ADR-P3. Tarea: SB5/SB6.
 */
import { SlaSweepScheduler } from './sla-sweep.scheduler';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { ITenantEnumerator } from '../../../shared/domain/ports/i-tenant-enumerator';
import { MarcarVencidosUseCase } from '../../application/use-cases/marcar-vencidos.use-case';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { unstubbed } from '../../../testing/mocks';

/**
 * Cliente de tenant marcado con su base: prototipo real de `TenantPrismaClient`
 * (no abre conexión) y una única propiedad propia que el test compara.
 */
function clienteDeTenant(dbName: string): InstanceType<typeof TenantPrismaClient> {
  return Object.assign(Object.create(TenantPrismaClient.prototype), { __dbName: dbName });
}

describe('SlaSweepScheduler', () => {
  function makeCollaborators() {
    const tenantEnumerator = { listActiveTenants: vi.fn<ITenantEnumerator['listActiveTenants']>() };
    const tenantContext = new TenantContext();
    const prismaService = {
      getTenantClient: vi
        .fn<PrismaService['getTenantClient']>()
        .mockImplementation(clienteDeTenant),
    };
    const marcarVencidosUseCase = {
      execute: vi.fn<MarcarVencidosUseCase['execute']>().mockResolvedValue(0),
    };
    const logger = { log: vi.fn<ILogger['log']>(), error: unstubbed('error') } satisfies ILogger;

    const scheduler = new SlaSweepScheduler(
      tenantEnumerator,
      tenantContext,
      prismaService,
      marcarVencidosUseCase,
      logger,
    );

    return {
      scheduler,
      tenantEnumerator,
      tenantContext,
      prismaService,
      marcarVencidosUseCase,
      logger,
    };
  }

  it('[CRITICAL] recorre TODOS los tenants activos y corre MarcarVencidos por cada uno', async () => {
    const c = makeCollaborators();
    c.tenantEnumerator.listActiveTenants.mockResolvedValue([
      { clienteId: 'cliente-1', dbName: 'soporte_cliente_1' },
      { clienteId: 'cliente-2', dbName: 'soporte_cliente_2' },
    ]);

    await c.scheduler.ejecutarBarrido();

    expect(c.marcarVencidosUseCase.execute).toHaveBeenCalledTimes(2);
    expect(c.prismaService.getTenantClient).toHaveBeenCalledWith('soporte_cliente_1');
    expect(c.prismaService.getTenantClient).toHaveBeenCalledWith('soporte_cliente_2');
  });

  it('[CRITICAL] cada corrida ejecuta MarcarVencidos DENTRO de tenantContext.run() bindeado al tenant', async () => {
    const c = makeCollaborators();
    c.tenantEnumerator.listActiveTenants.mockResolvedValue([
      { clienteId: 'cliente-1', dbName: 'soporte_cliente_1' },
    ]);
    let ctxDentroDelRun: unknown;
    c.marcarVencidosUseCase.execute.mockImplementation(async () => {
      ctxDentroDelRun = c.tenantContext.get();
      return 0;
    });

    await c.scheduler.ejecutarBarrido();

    expect(ctxDentroDelRun).toEqual({
      prismaClient: clienteDeTenant('soporte_cliente_1'),
      dbName: 'soporte_cliente_1',
      clienteId: 'cliente-1',
    });
  });

  it('[CRITICAL] un fallo en UN tenant se aísla — el barrido continúa con el resto', async () => {
    const c = makeCollaborators();
    c.tenantEnumerator.listActiveTenants.mockResolvedValue([
      { clienteId: 'cliente-1', dbName: 'soporte_cliente_1' },
      { clienteId: 'cliente-2', dbName: 'soporte_cliente_2' },
    ]);
    c.marcarVencidosUseCase.execute
      .mockRejectedValueOnce(new Error('tenant 1 caído'))
      .mockResolvedValueOnce(3);

    await expect(c.scheduler.ejecutarBarrido()).resolves.toBeUndefined();

    expect(c.marcarVencidosUseCase.execute).toHaveBeenCalledTimes(2);
    expect(c.logger.log).toHaveBeenCalledWith(expect.stringContaining('soporte_cliente_1'));
  });

  it('sin tenants activos → no lanza, no llama MarcarVencidos', async () => {
    const c = makeCollaborators();
    c.tenantEnumerator.listActiveTenants.mockResolvedValue([]);

    await expect(c.scheduler.ejecutarBarrido()).resolves.toBeUndefined();
    expect(c.marcarVencidosUseCase.execute).not.toHaveBeenCalled();
  });
});
