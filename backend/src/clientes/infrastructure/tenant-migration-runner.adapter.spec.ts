/**
 * Unit tests — TenantMigrationRunnerAdapter (Parte A, Batch 4)
 *
 * Verifica que el adapter construye la URL correcta del tenant y llama
 * execFn con el comando y env correctos.
 *
 * Estrategia TDD:
 *   RED  → TenantMigrationRunnerAdapter no existe aún.
 *   GREEN → implementar tenant-migration-runner.adapter.ts.
 *
 * ExecFn es injectable (mismo patrón que MigrateTenantsRunner) para que
 * los tests NO invoquen child_process.exec real.
 *
 * Ref spec: [SPEC:clientes/Provisioning de tenant nuevo — migraciones tenant]
 * Ref tarea: 7.B.2 (patrón de comando) / Batch 4 Parte A
 */
import { TenantMigrationRunnerAdapter, ExecFn } from './tenant-migration-runner.adapter';

describe('TenantMigrationRunnerAdapter (unit)', () => {
  const MASTER_URL = 'postgresql://user:pass@host:5432/soporte_master';
  let execFn: vi.MockedFunction<ExecFn>;
  let adapter: TenantMigrationRunnerAdapter;

  beforeEach(() => {
    execFn = vi.fn().mockResolvedValue(undefined);
    adapter = new TenantMigrationRunnerAdapter(MASTER_URL, execFn);
  });

  // ─── runMigrations ─────────────────────────────────────────────────────────

  describe('runMigrations', () => {
    it('calls execFn exactly once', async () => {
      await adapter.runMigrations('tenant_acme');
      expect(execFn).toHaveBeenCalledTimes(1);
    });

    it('calls execFn with prisma migrate deploy command', async () => {
      await adapter.runMigrations('tenant_acme');
      const [cmd] = execFn.mock.calls[0];
      expect(cmd).toContain('prisma migrate deploy');
    });

    it('includes --schema=prisma_tenant/schema.prisma in the command', async () => {
      await adapter.runMigrations('tenant_acme');
      const [cmd] = execFn.mock.calls[0];
      expect(cmd).toContain('--schema=prisma_tenant/schema.prisma');
    });

    it('includes --config prisma.tenant.config.ts in the command', async () => {
      await adapter.runMigrations('tenant_acme');
      const [cmd] = execFn.mock.calls[0];
      expect(cmd).toContain('--config prisma.tenant.config.ts');
    });

    it('passes DATABASE_URL_TENANT in the env override', async () => {
      await adapter.runMigrations('tenant_acme');
      const [, env] = execFn.mock.calls[0];
      expect(env).toHaveProperty('DATABASE_URL_TENANT');
    });

    it('sets DATABASE_URL_TENANT to tenant URL derived from masterUrl + dbName', async () => {
      await adapter.runMigrations('tenant_acme');
      const [, env] = execFn.mock.calls[0];
      expect(env.DATABASE_URL_TENANT).toBe('postgresql://user:pass@host:5432/tenant_acme');
    });

    it('handles dbNames with underscores and numbers', async () => {
      await adapter.runMigrations('soporte_e2e_20260625');
      const [, env] = execFn.mock.calls[0];
      expect(env.DATABASE_URL_TENANT).toBe('postgresql://user:pass@host:5432/soporte_e2e_20260625');
    });

    it('propagates exec errors (migrations failed)', async () => {
      execFn.mockRejectedValue(new Error('migrate deploy failed'));
      await expect(adapter.runMigrations('tenant_acme')).rejects.toThrow('migrate deploy failed');
    });
  });
});
