/**
 * 7.B.1 TEST — MigrateTenantsRunner (fan-out migration runner)
 *
 * Test unitario con mock de pg.Pool y ExecFn injectable.
 * NO requiere Postgres real ni Prisma CLI real.
 *
 * Verifica:
 * - Consulta master.clientes con activo=TRUE y deleted_at IS NULL
 * - Tenants soft-deleted excluidos (filtrado en SQL)
 * - Ejecuta `prisma migrate deploy` con DATABASE_URL_TENANT de CADA tenant
 * - Non-aborting fan-out: fallo en tenant N no aborta tenants N+1..M
 * - Registro de resultado por tenant (success/error con mensaje)
 * - CONTRATO CRÍTICO: pool se cierra en finally ANTES de retornar
 *   (necesario para que un DROP DATABASE subsecuente no falle por conexiones activas)
 *
 * Ref spec: [SPEC:design/Fan-out de migraciones, riesgo de drift de esquema]
 * Tarea: 7.B.1
 */

// ---- Mock de pg ----
// Pool se mockea ANTES del import del runner (jest.mock es hoisted).
jest.mock('pg', () => ({
  Pool: jest.fn(),
}));

import { Pool } from 'pg';
import { MigrateTenantsRunner } from './migrate-tenants.runner';

const MASTER_URL = 'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const SCHEMA_PATH = 'prisma_tenant/schema.prisma';

describe('MigrateTenantsRunner', () => {
  let mockQueryFn: jest.Mock;
  let mockEndFn: jest.Mock;
  let execFn: jest.Mock;
  let runner: MigrateTenantsRunner;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mocks frescos para cada test
    mockQueryFn = jest.fn();
    mockEndFn = jest.fn().mockResolvedValue(undefined);
    execFn = jest.fn().mockResolvedValue(undefined);

    // Pool constructor retorna siempre el mismo mockPool (shared reference)
    (Pool as unknown as jest.Mock).mockImplementation(() => ({
      query: mockQueryFn,
      end: mockEndFn,
    }));

    // Runner creado DESPUÉS de configurar el Pool mock
    runner = new MigrateTenantsRunner({
      masterUrl: MASTER_URL,
      tenantSchemaPath: SCHEMA_PATH,
      execFn,
    });
  });

  // ─── Constructor ─────────────────────────────────────────────────────────────────

  describe('Constructor — inicialización del pool', () => {
    it('creates a Pool with the master URL', () => {
      const PoolCtor = Pool as unknown as jest.Mock;
      expect(PoolCtor).toHaveBeenCalledTimes(1);
      const [opts] = PoolCtor.mock.calls[0] as [{ connectionString: string }];
      expect(opts.connectionString).toBe(MASTER_URL);
    });

    it('creates only one Pool (no pool per tenant in constructor)', () => {
      const PoolCtor = Pool as unknown as jest.Mock;
      expect(PoolCtor).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Query master.clientes ────────────────────────────────────────────────────

  describe('run() — query master.clientes', () => {
    it('queries clientes with activo = TRUE filter', async () => {
      mockQueryFn.mockResolvedValue({ rows: [] });

      await runner.run();

      const [sql] = mockQueryFn.mock.calls[0] as [string];
      expect(sql).toMatch(/activo\s*=\s*TRUE/i);
    });

    it('queries clientes with deleted_at IS NULL filter (excludes soft-deleted)', async () => {
      mockQueryFn.mockResolvedValue({ rows: [] });

      await runner.run();

      const [sql] = mockQueryFn.mock.calls[0] as [string];
      expect(sql).toMatch(/deleted_at\s+IS\s+NULL/i);
    });

    it('returns empty results when no active tenants exist', async () => {
      mockQueryFn.mockResolvedValue({ rows: [] });

      const results = await runner.run();

      expect(results).toEqual([]);
    });
  });

  // ─── prisma migrate deploy execution ─────────────────────────────────────────

  describe('run() — prisma migrate deploy per tenant', () => {
    it('calls migrate deploy once per active tenant', async () => {
      mockQueryFn.mockResolvedValue({
        rows: [
          { db_name: 'tenant_a' },
          { db_name: 'tenant_b' },
          { db_name: 'tenant_c' },
        ],
      });

      await runner.run();

      expect(execFn).toHaveBeenCalledTimes(3);
    });

    it('passes "prisma migrate deploy" in the command', async () => {
      mockQueryFn.mockResolvedValue({ rows: [{ db_name: 'tenant_acme' }] });

      await runner.run();

      const [cmd] = execFn.mock.calls[0] as [string, Record<string, string>];
      expect(cmd).toContain('prisma migrate deploy');
    });

    it('includes tenant schema path in the command', async () => {
      mockQueryFn.mockResolvedValue({ rows: [{ db_name: 'tenant_acme' }] });

      await runner.run();

      const [cmd] = execFn.mock.calls[0] as [string, Record<string, string>];
      expect(cmd).toContain(SCHEMA_PATH);
    });

    it('passes DATABASE_URL_TENANT with the tenant db_name (not master db)', async () => {
      mockQueryFn.mockResolvedValue({ rows: [{ db_name: 'tenant_acme' }] });

      await runner.run();

      const [, env] = execFn.mock.calls[0] as [string, Record<string, string>];
      expect(env.DATABASE_URL_TENANT).toContain('tenant_acme');
      expect(env.DATABASE_URL_TENANT).not.toContain('soporte_master_test');
    });

    it('uses a distinct DATABASE_URL_TENANT for each tenant', async () => {
      mockQueryFn.mockResolvedValue({
        rows: [{ db_name: 'tenant_a' }, { db_name: 'tenant_b' }],
      });

      await runner.run();

      const [, envA] = execFn.mock.calls[0] as [string, Record<string, string>];
      const [, envB] = execFn.mock.calls[1] as [string, Record<string, string>];
      expect(envA.DATABASE_URL_TENANT).toContain('tenant_a');
      expect(envB.DATABASE_URL_TENANT).toContain('tenant_b');
      expect(envA.DATABASE_URL_TENANT).not.toEqual(envB.DATABASE_URL_TENANT);
    });
  });

  // ─── Non-aborting fan-out ─────────────────────────────────────────────────────

  describe('run() — non-aborting fan-out', () => {
    it('attempts all tenants even when one fails in the middle', async () => {
      mockQueryFn.mockResolvedValue({
        rows: [
          { db_name: 'tenant_a' },
          { db_name: 'tenant_b' }, // este falla
          { db_name: 'tenant_c' },
        ],
      });
      execFn
        .mockResolvedValueOnce(undefined) // tenant_a: ok
        .mockRejectedValueOnce(new Error('migration failed')) // tenant_b: error
        .mockResolvedValueOnce(undefined); // tenant_c: ok

      await runner.run(); // NO debe lanzar

      expect(execFn).toHaveBeenCalledTimes(3); // los 3 fueron intentados
    });

    it('does not throw when a tenant migration fails', async () => {
      mockQueryFn.mockResolvedValue({ rows: [{ db_name: 'tenant_bad' }] });
      execFn.mockRejectedValue(new Error('migration failed'));

      await expect(runner.run()).resolves.not.toThrow();
    });
  });

  // ─── Result recording ─────────────────────────────────────────────────────────

  describe('run() — result recording per tenant', () => {
    it('records success result for a migrated tenant', async () => {
      mockQueryFn.mockResolvedValue({ rows: [{ db_name: 'tenant_ok' }] });

      const results = await runner.run();

      expect(results).toEqual([{ dbName: 'tenant_ok', status: 'success' }]);
    });

    it('records error result with message for a failed tenant', async () => {
      mockQueryFn.mockResolvedValue({ rows: [{ db_name: 'tenant_bad' }] });
      execFn.mockRejectedValue(new Error('prisma migration error'));

      const results = await runner.run();

      expect(results).toEqual([
        { dbName: 'tenant_bad', status: 'error', error: 'prisma migration error' },
      ]);
    });

    it('records mixed success/error results in tenant order', async () => {
      mockQueryFn.mockResolvedValue({
        rows: [
          { db_name: 'tenant_a' },
          { db_name: 'tenant_b' }, // falla
          { db_name: 'tenant_c' },
        ],
      });
      execFn
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('schema drift'))
        .mockResolvedValueOnce(undefined);

      const results = await runner.run();

      expect(results).toEqual([
        { dbName: 'tenant_a', status: 'success' },
        { dbName: 'tenant_b', status: 'error', error: 'schema drift' },
        { dbName: 'tenant_c', status: 'success' },
      ]);
    });
  });

  // ─── CONTRATO CRÍTICO: pool closing ──────────────────────────────────────────

  describe('run() — CONTRATO CRÍTICO: pool cerrado ANTES de retornar', () => {
    /**
     * El pool a master.clientes DEBE cerrarse antes de retornar,
     * independientemente del resultado. Esto permite que operaciones
     * posteriores (DROP DATABASE en rollback compensatorio) no fallen
     * con "database is being accessed by other users".
     */
    it('closes the pool after a successful run', async () => {
      mockQueryFn.mockResolvedValue({ rows: [{ db_name: 'tenant_a' }] });

      await runner.run();

      expect(mockEndFn).toHaveBeenCalledTimes(1);
    });

    it('closes the pool even when all tenant migrations fail', async () => {
      mockQueryFn.mockResolvedValue({
        rows: [{ db_name: 'tenant_a' }, { db_name: 'tenant_b' }],
      });
      execFn.mockRejectedValue(new Error('migration failed'));

      await runner.run(); // no lanza — fan-out no aborta

      expect(mockEndFn).toHaveBeenCalledTimes(1);
    });

    it('closes the pool even when the master query throws (and re-throws the error)', async () => {
      mockQueryFn.mockRejectedValue(new Error('connection refused'));

      await expect(runner.run()).rejects.toThrow('connection refused');

      expect(mockEndFn).toHaveBeenCalledTimes(1);
    });

    it('closes the pool BEFORE run() resolves (verified via call order)', async () => {
      // Garantía de orden: pool.end() se resuelve ANTES de que run() se resuelva.
      // Si no fuera así, un DROP DATABASE ejecutado inmediatamente después fallaría.
      const callOrder: string[] = [];
      mockQueryFn.mockResolvedValue({ rows: [] });
      mockEndFn.mockImplementation(async () => {
        callOrder.push('pool.end');
      });

      await runner.run().then(() => {
        callOrder.push('run.resolved');
      });

      expect(callOrder).toEqual(['pool.end', 'run.resolved']);
    });
  });
});
