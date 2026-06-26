/**
 * Unit tests — PostgresAdminAdapter (Parte A, Batch 4)
 *
 * Verifica que el adapter delega correctamente todas las operaciones
 * a PostgresAdminService sin agregar lógica propia.
 *
 * RED: falla porque PostgresAdminAdapter no existe aún.
 * GREEN: implementar postgres-admin.adapter.ts.
 *
 * Ref spec: [SPEC:clientes/Provisioning de tenant nuevo, Rollback compensatorio]
 * Tarea: Batch 4 - Parte A (adapter IPostgresAdminPort)
 */
import { PostgresAdminAdapter } from './postgres-admin.adapter';
import { PostgresAdminService } from '../../shared/infrastructure/persistence/postgres-admin.service';

// ─── Mock de PostgresAdminService ─────────────────────────────────────────────
// Solo mockeamos los métodos que expone IPostgresAdminPort.
// No necesitamos mockear onModuleDestroy ni los privados.
type ServiceMock = Pick<PostgresAdminService, 'createDatabase' | 'dropDatabase' | 'databaseExists'>;

function makeServiceMock(): jest.Mocked<ServiceMock> {
  return {
    createDatabase: jest.fn().mockResolvedValue(undefined),
    dropDatabase: jest.fn().mockResolvedValue(undefined),
    databaseExists: jest.fn().mockResolvedValue(true),
  };
}

describe('PostgresAdminAdapter (unit)', () => {
  let adapter: PostgresAdminAdapter;
  let service: jest.Mocked<ServiceMock>;

  beforeEach(() => {
    service = makeServiceMock();
    adapter = new PostgresAdminAdapter(service as unknown as PostgresAdminService);
  });

  // ─── createDatabase ────────────────────────────────────────────────────────

  describe('createDatabase', () => {
    it('delegates to service.createDatabase with the same dbName', async () => {
      await adapter.createDatabase('acme_tenant');
      expect(service.createDatabase).toHaveBeenCalledTimes(1);
      expect(service.createDatabase).toHaveBeenCalledWith('acme_tenant');
    });

    it('propagates errors thrown by the service', async () => {
      service.createDatabase.mockRejectedValue(new Error('DB already exists'));
      await expect(adapter.createDatabase('acme_tenant')).rejects.toThrow('DB already exists');
    });

    it('resolves void on success (no return value)', async () => {
      const result = await adapter.createDatabase('acme_tenant');
      expect(result).toBeUndefined();
    });
  });

  // ─── dropDatabase ──────────────────────────────────────────────────────────

  describe('dropDatabase', () => {
    it('delegates to service.dropDatabase with the same dbName', async () => {
      await adapter.dropDatabase('acme_tenant');
      expect(service.dropDatabase).toHaveBeenCalledTimes(1);
      expect(service.dropDatabase).toHaveBeenCalledWith('acme_tenant');
    });

    it('propagates errors thrown by the service', async () => {
      service.dropDatabase.mockRejectedValue(new Error('active connections'));
      await expect(adapter.dropDatabase('acme_tenant')).rejects.toThrow('active connections');
    });
  });

  // ─── databaseExists ────────────────────────────────────────────────────────

  describe('databaseExists', () => {
    it('delegates to service.databaseExists with the same dbName', async () => {
      await adapter.databaseExists('acme_tenant');
      expect(service.databaseExists).toHaveBeenCalledTimes(1);
      expect(service.databaseExists).toHaveBeenCalledWith('acme_tenant');
    });

    it('returns true when service returns true', async () => {
      service.databaseExists.mockResolvedValue(true);
      const result = await adapter.databaseExists('acme_tenant');
      expect(result).toBe(true);
    });

    it('returns false when service returns false', async () => {
      service.databaseExists.mockResolvedValue(false);
      const result = await adapter.databaseExists('acme_tenant');
      expect(result).toBe(false);
    });
  });
});
