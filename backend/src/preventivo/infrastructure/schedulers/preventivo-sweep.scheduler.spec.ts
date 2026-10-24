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
import { ITenantEnumerator } from '../../../shared/domain/ports/i-tenant-enumerator';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { GenerarPreventivosUseCase } from '../../application/use-cases/generar-preventivos.use-case';
import { EnviarRecordatoriosPreventivoUseCase } from '../../application/use-cases/enviar-recordatorios-preventivo.use-case';

/**
 * Cliente de tenant falso: lleva el prototipo del cliente real y queda marcado
 * con su base, para reconocerlo en el contexto del tenant.
 */
function clienteFalso(dbName: string): InstanceType<typeof TenantPrismaClient> {
  return Object.assign(Object.create(TenantPrismaClient.prototype), { __dbName: dbName });
}

describe('PreventivoSweepScheduler', () => {
  function makeCollaborators() {
    const tenantEnumerator = { listActiveTenants: vi.fn<ITenantEnumerator['listActiveTenants']>() };
    const tenantContext = new TenantContext();
    const prismaService = {
      getTenantClient: vi.fn<PrismaService['getTenantClient']>().mockImplementation(clienteFalso),
    };
    const generarPreventivosUseCase = {
      execute: vi.fn<GenerarPreventivosUseCase['execute']>().mockResolvedValue(undefined),
    };
    const logger = { error: vi.fn<ILogger['error']>() };
    const enviarRecordatoriosUseCase = {
      execute: vi
        .fn<EnviarRecordatoriosPreventivoUseCase['execute']>()
        .mockResolvedValue(undefined),
    };

    const scheduler = new PreventivoSweepScheduler(
      tenantEnumerator,
      tenantContext,
      prismaService,
      generarPreventivosUseCase,
      logger,
      enviarRecordatoriosUseCase,
    );

    return {
      scheduler,
      tenantEnumerator,
      tenantContext,
      prismaService,
      generarPreventivosUseCase,
      logger,
      enviarRecordatoriosUseCase,
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
      prismaClient: clienteFalso('soporte_cliente_1'),
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

  // ─── Recordatorio (odd/preventivo-anticipacion T3, S4) ─────────────────
  describe('recordatorio de preventivo', () => {
    it('corre los recordatorios de cada tenant DESPUÉS de su generación, dentro de su contexto', async () => {
      const c = makeCollaborators();
      c.tenantEnumerator.listActiveTenants.mockResolvedValue([
        { clienteId: 'cliente-1', dbName: 'soporte_cliente_1' },
        { clienteId: 'cliente-2', dbName: 'soporte_cliente_2' },
      ]);
      const contextos: unknown[] = [];
      c.enviarRecordatoriosUseCase.execute.mockImplementation(async () => {
        contextos.push(c.tenantContext.get()?.dbName);
      });

      await c.scheduler.ejecutarBarrido();

      expect(c.enviarRecordatoriosUseCase.execute).toHaveBeenCalledTimes(2);
      expect(contextos).toEqual(['soporte_cliente_1', 'soporte_cliente_2']);
      const ordenGenerar = c.generarPreventivosUseCase.execute.mock.invocationCallOrder[0];
      const ordenRecordar = c.enviarRecordatoriosUseCase.execute.mock.invocationCallOrder[0];
      expect(ordenGenerar).toBeLessThan(ordenRecordar);
    });

    it('si la generación de un tenant falla, sus recordatorios corren igual', async () => {
      const c = makeCollaborators();
      c.tenantEnumerator.listActiveTenants.mockResolvedValue([
        { clienteId: 'cliente-1', dbName: 'soporte_cliente_1' },
      ]);
      c.generarPreventivosUseCase.execute.mockRejectedValue(new Error('catálogo roto'));

      await c.scheduler.ejecutarBarrido();

      expect(c.enviarRecordatoriosUseCase.execute).toHaveBeenCalledTimes(1);
      expect(c.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('PREVENTIVO_SWEEP_ERROR | tenant=soporte_cliente_1'),
      );
    });

    it('un fallo de recordatorios se loguea con su código y el tenant, y el barrido sigue con el siguiente', async () => {
      const c = makeCollaborators();
      c.tenantEnumerator.listActiveTenants.mockResolvedValue([
        { clienteId: 'cliente-1', dbName: 'soporte_cliente_1' },
        { clienteId: 'cliente-2', dbName: 'soporte_cliente_2' },
      ]);
      c.enviarRecordatoriosUseCase.execute
        .mockRejectedValueOnce(new Error('base caída'))
        .mockResolvedValueOnce(undefined);

      await expect(c.scheduler.ejecutarBarrido()).resolves.toBeUndefined();

      expect(c.logger.error).toHaveBeenCalledWith(
        'PREVENTIVO_RECORDATORIO_ERROR | tenant=soporte_cliente_1 | error=base caída',
      );
      expect(c.generarPreventivosUseCase.execute).toHaveBeenCalledWith('cliente-2');
      expect(c.enviarRecordatoriosUseCase.execute).toHaveBeenCalledTimes(2);
    });
  });
});
