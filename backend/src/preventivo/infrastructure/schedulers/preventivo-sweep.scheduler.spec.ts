/**
 * preventivo-sweep.scheduler.spec.ts — WU-5 (5.7) [UNIT]: PreventivoSweepScheduler.
 *
 * Mismo criterio que `sla-sweep.scheduler.spec.ts` (S5/ADR-P3): se instancia
 * la clase DIRECTAMENTE y se invoca el HANDLER a mano — el timing del
 * `@Cron` NO se testea. Cubre el fan-out multi-tenant (R10) y el aislamiento
 * por tenant (un tenant que lanza no aborta el resto, log enmascarado).
 *
 * Ref spec: sdd/preventivo/spec, Requirement "Aislamiento por tenant en el
 * barrido". Ref design: flujo de datos (ADR-PV3). Tarea: 5.6/5.7.
 */
import { PreventivoSweepScheduler } from './preventivo-sweep.scheduler';
import { TenantContext } from '../../../shared/tenancy/tenant-context';

describe('PreventivoSweepScheduler', () => {
  function makeCollaborators() {
    const tenantEnumerator = { listActiveTenants: vi.fn() };
    const tenantContext = new TenantContext();
    const prismaService = {
      getTenantClient: vi.fn().mockImplementation((dbName: string) => ({ __dbName: dbName })),
    };
    const generarPreventivosUseCase = { execute: vi.fn().mockResolvedValue(undefined) };
    const logger = { error: vi.fn() };

    const scheduler = new PreventivoSweepScheduler(
      tenantEnumerator as never,
      tenantContext,
      prismaService as never,
      generarPreventivosUseCase as never,
      logger,
    );

    return {
      scheduler,
      tenantEnumerator,
      tenantContext,
      prismaService,
      generarPreventivosUseCase,
      logger,
    };
  }

  it('[R10] recorre TODOS los tenants activos y corre GenerarPreventivos por cada uno con su clienteId', async () => {
    const c = makeCollaborators();
    c.tenantEnumerator.listActiveTenants.mockResolvedValue([
      { clienteId: 'cliente-1', dbName: 'soporte_cliente_1' },
      { clienteId: 'cliente-2', dbName: 'soporte_cliente_2' },
    ]);

    await c.scheduler.ejecutarBarrido();

    expect(c.generarPreventivosUseCase.execute).toHaveBeenCalledTimes(2);
    expect(c.generarPreventivosUseCase.execute).toHaveBeenCalledWith('cliente-1');
    expect(c.generarPreventivosUseCase.execute).toHaveBeenCalledWith('cliente-2');
    expect(c.prismaService.getTenantClient).toHaveBeenCalledWith('soporte_cliente_1');
    expect(c.prismaService.getTenantClient).toHaveBeenCalledWith('soporte_cliente_2');
  });

  it('cada corrida ejecuta GenerarPreventivos DENTRO de tenantContext.run() bindeado al tenant', async () => {
    const c = makeCollaborators();
    c.tenantEnumerator.listActiveTenants.mockResolvedValue([
      { clienteId: 'cliente-1', dbName: 'soporte_cliente_1' },
    ]);
    let ctxDentroDelRun: unknown;
    c.generarPreventivosUseCase.execute.mockImplementation(async () => {
      ctxDentroDelRun = c.tenantContext.get();
    });

    await c.scheduler.ejecutarBarrido();

    expect(ctxDentroDelRun).toEqual({
      prismaClient: { __dbName: 'soporte_cliente_1' },
      dbName: 'soporte_cliente_1',
      clienteId: 'cliente-1',
    });
  });

  it('[R10] un fallo en UN tenant se aísla — el barrido continúa con el resto, log con dbName + mensaje (nunca el objeto de error crudo)', async () => {
    const c = makeCollaborators();
    c.tenantEnumerator.listActiveTenants.mockResolvedValue([
      { clienteId: 'cliente-1', dbName: 'soporte_cliente_1' },
      { clienteId: 'cliente-2', dbName: 'soporte_cliente_2' },
    ]);
    c.generarPreventivosUseCase.execute
      .mockRejectedValueOnce(new Error('tenant 1 caído'))
      .mockResolvedValueOnce(undefined);

    await expect(c.scheduler.ejecutarBarrido()).resolves.toBeUndefined();

    expect(c.generarPreventivosUseCase.execute).toHaveBeenCalledTimes(2);
    expect(c.logger.error).toHaveBeenCalledWith(expect.stringContaining('soporte_cliente_1'));
    // Nunca se le pasa el objeto Error crudo al logger — solo el string armado.
    const [[argumentoLogueado]] = c.logger.error.mock.calls as [unknown][];
    expect(typeof argumentoLogueado).toBe('string');
  });

  it('sin tenants activos → no lanza, no llama GenerarPreventivos', async () => {
    const c = makeCollaborators();
    c.tenantEnumerator.listActiveTenants.mockResolvedValue([]);

    await expect(c.scheduler.ejecutarBarrido()).resolves.toBeUndefined();
    expect(c.generarPreventivosUseCase.execute).not.toHaveBeenCalled();
  });

  it('la master DB falla al enumerar tenants → el handler NO propaga (no unhandled rejection), queda logueado y no procesa ningún tenant', async () => {
    const c = makeCollaborators();
    c.tenantEnumerator.listActiveTenants.mockRejectedValue(new Error('master db caída'));

    await expect(c.scheduler.ejecutarBarrido()).resolves.toBeUndefined();

    expect(c.generarPreventivosUseCase.execute).not.toHaveBeenCalled();
    expect(c.logger.error).toHaveBeenCalledWith(expect.stringContaining('PREVENTIVO_SWEEP_ERROR'));
    expect(c.logger.error).toHaveBeenCalledWith(expect.stringContaining('master db caída'));
    // Nunca se le pasa el objeto Error crudo al logger — solo el string armado.
    const [[argumentoLogueado]] = c.logger.error.mock.calls as [unknown][];
    expect(typeof argumentoLogueado).toBe('string');
  });
});
