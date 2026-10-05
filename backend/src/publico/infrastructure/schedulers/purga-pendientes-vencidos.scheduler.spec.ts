/**
 * purga-pendientes-vencidos.scheduler.spec.ts — WU-20 (20.1) [UNIT]: PurgaPendientesVencidosScheduler.
 *
 * Mismo criterio que `preventivo-sweep.scheduler.spec.ts`: se instancia la clase DIRECTAMENTE y se
 * invoca el HANDLER a mano — el timing del `@Cron` NO se testea. Cubre el fan-out multi-tenant,
 * el binding de `TenantContext` y el aislamiento por tenant.
 *
 * Remedia W2 del verify-report: los pendientes vencidos son PII sin verificar y no pueden depender
 * de que llegue otra solicitud al mismo tenant.
 */
import { PurgaPendientesVencidosScheduler } from './purga-pendientes-vencidos.scheduler';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { ITenantEnumerator } from '../../../shared/domain/ports/i-tenant-enumerator';
import { IPedidoPendienteRepository } from '../../domain/ports/i-pedido-pendiente.repository';

describe('PurgaPendientesVencidosScheduler', () => {
  function makeCollaborators() {
    const tenantEnumerator = {
      listTenantsConBase: vi.fn<ITenantEnumerator['listTenantsConBase']>(),
    };
    const tenantContext = new TenantContext();
    const prismaService = {
      // El scheduler solo reenvía el cliente a `TenantContext`: un marcador alcanza.
      getTenantClient: vi
        .fn<PrismaService['getTenantClient']>()
        .mockImplementation(
          (dbName: string) =>
            ({ __dbName: dbName }) as unknown as ReturnType<PrismaService['getTenantClient']>,
        ),
    };
    const pendienteRepo = {
      purgarVencidos: vi.fn<IPedidoPendienteRepository['purgarVencidos']>().mockResolvedValue(0),
    };
    const logger = { log: vi.fn(), error: vi.fn() };

    const scheduler = new PurgaPendientesVencidosScheduler(
      tenantEnumerator,
      tenantContext,
      prismaService,
      pendienteRepo,
      logger,
    );

    return { scheduler, tenantEnumerator, tenantContext, prismaService, pendienteRepo, logger };
  }

  it('recorre TODOS los tenants activos y purga los pendientes vencidos de cada uno', async () => {
    const c = makeCollaborators();
    c.tenantEnumerator.listTenantsConBase.mockResolvedValue([
      { clienteId: 'cliente-1', dbName: 'soporte_cliente_1', vivo: true },
      { clienteId: 'cliente-2', dbName: 'soporte_cliente_2', vivo: true },
    ]);

    await c.scheduler.ejecutarBarrido();

    expect(c.pendienteRepo.purgarVencidos).toHaveBeenCalledTimes(2);
    expect(c.prismaService.getTenantClient).toHaveBeenCalledWith('soporte_cliente_1');
    expect(c.prismaService.getTenantClient).toHaveBeenCalledWith('soporte_cliente_2');
  });

  it('enumera con listTenantsConBase y purga también a un tenant dado de baja (PII sin confirmar no sobrevive a la baja)', async () => {
    const c = makeCollaborators();
    c.tenantEnumerator.listTenantsConBase.mockResolvedValue([
      { clienteId: 'cliente-baja', dbName: 'soporte_cliente_baja', vivo: false },
    ]);

    await c.scheduler.ejecutarBarrido();

    expect(c.tenantEnumerator.listTenantsConBase).toHaveBeenCalledTimes(1);
    expect(c.prismaService.getTenantClient).toHaveBeenCalledWith('soporte_cliente_baja');
    expect(c.pendienteRepo.purgarVencidos).toHaveBeenCalledTimes(1);
  });

  it('un tenant dado de baja sin la tabla (P2021: migrate-tenants solo migra activos) no es error: no puede tener pendientes', async () => {
    const c = makeCollaborators();
    c.tenantEnumerator.listTenantsConBase.mockResolvedValue([
      { clienteId: 'cliente-baja', dbName: 'soporte_cliente_baja', vivo: false },
      { clienteId: 'cliente-1', dbName: 'soporte_cliente_1', vivo: true },
    ]);
    c.pendienteRepo.purgarVencidos
      .mockRejectedValueOnce(Object.assign(new Error('table does not exist'), { code: 'P2021' }))
      .mockResolvedValueOnce(2);

    await c.scheduler.ejecutarBarrido();

    expect(c.logger.error).not.toHaveBeenCalled();
    expect(c.pendienteRepo.purgarVencidos).toHaveBeenCalledTimes(2);
    expect(c.logger.log).toHaveBeenCalledWith(expect.stringContaining('soporte_cliente_1'));
  });

  it('un tenant VIVO sin la tabla (P2021) sí es error: es una migración rota y se loguea', async () => {
    const c = makeCollaborators();
    c.tenantEnumerator.listTenantsConBase.mockResolvedValue([
      { clienteId: 'cliente-1', dbName: 'soporte_cliente_1', vivo: true },
    ]);
    c.pendienteRepo.purgarVencidos.mockRejectedValueOnce(
      Object.assign(new Error('table does not exist'), { code: 'P2021' }),
    );

    await c.scheduler.ejecutarBarrido();

    expect(c.logger.error).toHaveBeenCalledWith(expect.stringContaining('soporte_cliente_1'));
  });

  it('cada purga corre DENTRO de tenantContext.run() bindeado al tenant', async () => {
    const c = makeCollaborators();
    c.tenantEnumerator.listTenantsConBase.mockResolvedValue([
      { clienteId: 'cliente-1', dbName: 'soporte_cliente_1', vivo: true },
    ]);
    let ctxDentroDelRun: unknown;
    c.pendienteRepo.purgarVencidos.mockImplementation(async () => {
      ctxDentroDelRun = c.tenantContext.get();
      return 0;
    });

    await c.scheduler.ejecutarBarrido();

    expect(ctxDentroDelRun).toEqual({
      prismaClient: { __dbName: 'soporte_cliente_1' },
      dbName: 'soporte_cliente_1',
      clienteId: 'cliente-1',
    });
  });

  it('un fallo en UN tenant se aísla — el barrido continúa con el resto, log con dbName + mensaje (nunca el objeto de error crudo)', async () => {
    const c = makeCollaborators();
    c.tenantEnumerator.listTenantsConBase.mockResolvedValue([
      { clienteId: 'cliente-1', dbName: 'soporte_cliente_1', vivo: true },
      { clienteId: 'cliente-2', dbName: 'soporte_cliente_2', vivo: true },
    ]);
    c.pendienteRepo.purgarVencidos
      .mockRejectedValueOnce(new Error('tenant 1 caído'))
      .mockResolvedValueOnce(3);

    await expect(c.scheduler.ejecutarBarrido()).resolves.toBeUndefined();

    expect(c.pendienteRepo.purgarVencidos).toHaveBeenCalledTimes(2);
    expect(c.logger.error).toHaveBeenCalledWith(expect.stringContaining('soporte_cliente_1'));
    expect(c.logger.error).toHaveBeenCalledWith(expect.stringContaining('tenant 1 caído'));
    const [[argumentoLogueado]] = c.logger.error.mock.calls as [unknown][];
    expect(typeof argumentoLogueado).toBe('string');
  });

  it('loguea la cantidad borrada solo cuando hay algo que contar, sin datos del solicitante', async () => {
    const c = makeCollaborators();
    c.tenantEnumerator.listTenantsConBase.mockResolvedValue([
      { clienteId: 'cliente-1', dbName: 'soporte_cliente_1', vivo: true },
      { clienteId: 'cliente-2', dbName: 'soporte_cliente_2', vivo: true },
    ]);
    c.pendienteRepo.purgarVencidos.mockResolvedValueOnce(0).mockResolvedValueOnce(4);

    await c.scheduler.ejecutarBarrido();

    expect(c.logger.log).toHaveBeenCalledTimes(1);
    expect(c.logger.log).toHaveBeenCalledWith(expect.stringContaining('soporte_cliente_2'));
    expect(c.logger.log).toHaveBeenCalledWith(expect.stringContaining('4'));
  });

  it('sin tenants activos → no lanza, no purga nada', async () => {
    const c = makeCollaborators();
    c.tenantEnumerator.listTenantsConBase.mockResolvedValue([]);

    await expect(c.scheduler.ejecutarBarrido()).resolves.toBeUndefined();
    expect(c.pendienteRepo.purgarVencidos).not.toHaveBeenCalled();
  });

  it('la master DB falla al enumerar → el handler NO propaga (no unhandled rejection), queda logueado y no purga ningún tenant', async () => {
    const c = makeCollaborators();
    c.tenantEnumerator.listTenantsConBase.mockRejectedValue(new Error('master db caída'));

    await expect(c.scheduler.ejecutarBarrido()).resolves.toBeUndefined();

    expect(c.pendienteRepo.purgarVencidos).not.toHaveBeenCalled();
    expect(c.logger.error).toHaveBeenCalledWith(expect.stringContaining('PURGA_PENDIENTES_ERROR'));
    expect(c.logger.error).toHaveBeenCalledWith(expect.stringContaining('master db caída'));
  });
});
