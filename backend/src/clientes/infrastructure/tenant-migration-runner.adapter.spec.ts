/**
 * T7.3 [UNIT] — Tests de `TenantMigrationRunnerAdapter` con `execFn`
 * inyectado (mockeado) — sin spawnear un proceso real.
 *
 * Contrato verificado (R18):
 * - `run(dbName)` invoca `prisma migrate deploy` con
 *   `--schema=prisma_tenant/schema.prisma --config prisma.tenant.config.ts`
 *   (mismo comando que el script `migrate:tenant` de `package.json`).
 * - La URL de conexión del tenant se pasa vía `DATABASE_URL_TENANT` en el
 *   `env` del subproceso (leído por `prisma.tenant.config.ts`) — derivada de
 *   `masterUrl` reemplazando el nombre de la DB (mismo patrón que
 *   `PrismaService.buildTenantUrl`).
 * - Si `execFn` rechaza (el comando falla), `run` MUST propagar el error
 *   (el rollback de R18 lo captura un nivel más arriba).
 * - El comando corre con `cwd` = raíz del backend (donde viven
 *   `prisma_tenant/` y `prisma.tenant.config.ts`).
 *
 * Ref spec: sdd/auth-multitenancy/spec §R18
 * Tarea: T7.3
 */
import { TenantMigrationRunnerAdapter } from './tenant-migration-runner.adapter';

const MASTER_URL = 'postgresql://soporte:soporte@localhost:5432/soporte_master';

describe('TenantMigrationRunnerAdapter (T7.3, unit — execFn mockeado)', () => {
  it('[CRITICAL] invoca "prisma migrate deploy" con --schema y --config del tenant', async () => {
    const execFn = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    const adapter = new TenantMigrationRunnerAdapter(MASTER_URL, execFn);

    await adapter.run('soporte_prov_demo_test');

    expect(execFn).toHaveBeenCalledTimes(1);
    const [command] = execFn.mock.calls[0]!;
    expect(command).toContain('prisma migrate deploy');
    expect(command).toContain('--schema=prisma_tenant/schema.prisma');
    expect(command).toContain('--config prisma.tenant.config.ts');
  });

  it('[CRITICAL] pasa DATABASE_URL_TENANT derivada de masterUrl con el dbName del tenant', async () => {
    const execFn = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    const adapter = new TenantMigrationRunnerAdapter(MASTER_URL, execFn);

    await adapter.run('soporte_prov_demo_test');

    const [, options] = execFn.mock.calls[0]!;
    const tenantUrl = new URL(options.env.DATABASE_URL_TENANT);
    expect(tenantUrl.pathname).toBe('/soporte_prov_demo_test');
    expect(tenantUrl.username).toBe('soporte');
  });

  it('corre con cwd = la raíz del backend inyectada', async () => {
    const execFn = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    const adapter = new TenantMigrationRunnerAdapter(MASTER_URL, execFn, '/ruta/backend');

    await adapter.run('soporte_prov_demo_test');

    const [, options] = execFn.mock.calls[0]!;
    expect(options.cwd).toBe('/ruta/backend');
  });

  it('[FIX] propaga el error si execFn rechaza (para que el rollback de R18 lo capture)', async () => {
    const execFn = vi.fn().mockRejectedValue(new Error('migrate deploy falló: P3009'));
    const adapter = new TenantMigrationRunnerAdapter(MASTER_URL, execFn);

    await expect(adapter.run('soporte_prov_demo_test')).rejects.toThrow('migrate deploy falló');
  });

  it('preserva las env vars existentes del proceso (no las pisa, solo agrega DATABASE_URL_TENANT)', async () => {
    const execFn = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    const adapter = new TenantMigrationRunnerAdapter(MASTER_URL, execFn);
    process.env.SOME_UNRELATED_VAR = 'preserved';

    await adapter.run('soporte_prov_demo_test');

    const [, options] = execFn.mock.calls[0]!;
    expect(options.env.SOME_UNRELATED_VAR).toBe('preserved');
    delete process.env.SOME_UNRELATED_VAR;
  });
});
