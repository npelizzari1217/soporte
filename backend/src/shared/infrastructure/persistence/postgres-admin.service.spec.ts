/**
 * 7.A.1 TEST — PostgresAdminService
 *
 * Test unitario con mock de pg.Pool — NO requiere Postgres real.
 * El test e2e contra DB real se hace en 7.C.
 *
 * Verifica:
 * - createDatabase(dbName) ejecuta CREATE DATABASE con identificador quoted
 * - dropDatabase(dbName) ejecuta DROP DATABASE IF EXISTS (compensación en rollback)
 * - databaseExists(dbName) consulta pg_database con query parametrizada
 * - Usa la DB ADMIN (postgres), NO el client tenant ni el master DB name
 *
 * Ref spec: [SPEC:clientes/Provisioning fallido dispara rollback compensatorio]
 * Tarea: 7.A.1
 */

// ---- Mocks ----
// pg.Pool mockeado ANTES del import del service (jest.mock es hoisted)
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: jest.fn(),
    end: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { Pool } from 'pg';
import { PostgresAdminService } from './postgres-admin.service';

// Credenciales de test — apuntan a master pero el service deriva la URL admin
const MASTER_URL = 'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

describe('PostgresAdminService', () => {
  let service: PostgresAdminService;
  let mockPool: { query: jest.Mock; end: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PostgresAdminService(MASTER_URL);

    // Obtener la instancia de Pool creada durante la construcción del servicio
    const PoolCtor = Pool as unknown as jest.Mock;
    mockPool = PoolCtor.mock.results[0].value as { query: jest.Mock; end: jest.Mock };
  });

  // ─── Constructor — conexión a DB admin, NO al tenant ────────────────────────

  describe('Constructor — conecta a la DB admin (postgres), no a la DB master ni tenant', () => {
    it('should connect to the postgres admin DB, not the master DB name', () => {
      const PoolCtor = Pool as unknown as jest.Mock;
      const { connectionString } = PoolCtor.mock.calls[0][0] as { connectionString: string };

      // Debe apuntar a la DB 'postgres' (admin)
      expect(connectionString).toContain('/postgres');
      // NO debe contener el nombre de la DB master
      expect(connectionString).not.toContain('soporte_master_test');
    });

    it('should preserve credentials and host from master URL', () => {
      const PoolCtor = Pool as unknown as jest.Mock;
      const { connectionString } = PoolCtor.mock.calls[0][0] as { connectionString: string };

      expect(connectionString).toContain('soporte:soporte@localhost:5432');
    });

    it('should only create one Pool (admin), never one per tenant', () => {
      const PoolCtor = Pool as unknown as jest.Mock;
      // Solo se crea un Pool — el del admin. No se crean pools por tenant aquí.
      expect(PoolCtor).toHaveBeenCalledTimes(1);
    });
  });

  // ─── createDatabase ─────────────────────────────────────────────────────────

  describe('createDatabase(dbName)', () => {
    it('should execute CREATE DATABASE with a quoted identifier', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await service.createDatabase('tenant_acme');

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      const [sql] = mockPool.query.mock.calls[0] as [string, ...unknown[]];
      expect(sql).toMatch(/CREATE DATABASE/i);
      expect(sql).toContain('"tenant_acme"');
    });

    it('should quote the identifier to prevent SQL injection in DB name', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await service.createDatabase('some_db');

      const [sql] = mockPool.query.mock.calls[0] as [string, ...unknown[]];
      // El nombre debe ir entre comillas dobles (quoted identifier)
      expect(sql).toMatch(/"some_db"/);
    });

    it('should propagate errors from pool.query', async () => {
      mockPool.query.mockRejectedValue(new Error('database "tenant_acme" already exists'));

      await expect(service.createDatabase('tenant_acme')).rejects.toThrow(
        'database "tenant_acme" already exists',
      );
    });
  });

  // ─── dropDatabase ────────────────────────────────────────────────────────────

  describe('dropDatabase(dbName)', () => {
    it('should execute DROP DATABASE IF EXISTS with a quoted identifier', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await service.dropDatabase('tenant_acme');

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      const [sql] = mockPool.query.mock.calls[0] as [string, ...unknown[]];
      expect(sql).toMatch(/DROP DATABASE IF EXISTS/i);
      expect(sql).toContain('"tenant_acme"');
      // WITH (FORCE) termina conexiones activas automáticamente (PG 16+),
      // evitando que la DB quede huérfana si un pool no cerró antes del drop.
      expect(sql).toMatch(/WITH \(FORCE\)/i);
    });

    it('should resolve without error even if DB does not exist (IF EXISTS guard)', async () => {
      // IF EXISTS previene error cuando la DB no existe — compensación segura en rollback
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(service.dropDatabase('non_existent_db')).resolves.toBeUndefined();
    });

    it('should propagate real errors (e.g. admin server connection failure)', async () => {
      mockPool.query.mockRejectedValue(new Error('connection refused'));

      await expect(service.dropDatabase('tenant_acme')).rejects.toThrow('connection refused');
    });
  });

  // ─── databaseExists ──────────────────────────────────────────────────────────

  describe('databaseExists(dbName)', () => {
    it('should return true when the database exists in pg_database', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ '?column?': 1 }], rowCount: 1 });

      const result = await service.databaseExists('tenant_acme');

      expect(result).toBe(true);
    });

    it('should return false when the database does not exist', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await service.databaseExists('non_existent');

      expect(result).toBe(false);
    });

    it('should query pg_database with a parameterized value (not identifier injection)', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await service.databaseExists('my_db');

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mockPool.query.mock.calls[0] as [string, string[]];
      // La consulta a pg_database debe usar parámetro $1, no interpolación
      expect(sql).toContain('pg_database');
      expect(sql).toContain('$1');
      expect(params).toEqual(['my_db']);
    });

    it('should propagate query errors', async () => {
      mockPool.query.mockRejectedValue(new Error('connection refused'));

      await expect(service.databaseExists('any_db')).rejects.toThrow('connection refused');
    });
  });

  // ─── onModuleDestroy ─────────────────────────────────────────────────────────

  describe('onModuleDestroy()', () => {
    it('should call pool.end() to close all connections', async () => {
      await service.onModuleDestroy();

      expect(mockPool.end).toHaveBeenCalledTimes(1);
    });
  });
});
