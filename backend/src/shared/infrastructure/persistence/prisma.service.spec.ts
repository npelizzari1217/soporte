/**
 * prisma.service.spec.ts — TDD RED phase
 *
 * Tests del factory multi-tenant de PrismaService.
 * No necesita Postgres real — mockeamos PrismaClient y Pool de pg.
 * Tarea: 0.C.3
 */

// ---- Mocks ----
// vi.hoisted garantiza que los constructores mock estén disponibles antes del
// import del service y del hoisting de vi.mock (patrón canónico Vitest 4.x).
const { MockMasterPrismaClient, MockTenantPrismaClient, MockPool, MockPrismaPg } = vi.hoisted(
  () => ({
    // function() en lugar de arrow — Vitest 4.x requiere function/class para
    // mocks usados como constructores (new MasterPrismaClient(...), new Pool(...)).
    MockMasterPrismaClient: vi.fn().mockImplementation(function () {
      return {
        $disconnect: vi.fn().mockResolvedValue(undefined),
        $transaction: vi.fn(),
        masterSeedVersion: {},
      };
    }),
    MockTenantPrismaClient: vi.fn().mockImplementation(function () {
      return {
        $disconnect: vi.fn().mockResolvedValue(undefined),
        $transaction: vi.fn(),
        tenantSeedVersion: {},
      };
    }),
    MockPool: vi.fn().mockImplementation(function () {
      return {
        end: vi.fn().mockResolvedValue(undefined),
      };
    }),
    MockPrismaPg: vi.fn().mockImplementation(function () {
      return {};
    }),
  }),
);

vi.mock('./prisma-clients', () => ({
  MasterPrismaClient: MockMasterPrismaClient,
  TenantPrismaClient: MockTenantPrismaClient,
}));

vi.mock('pg', () => ({
  Pool: MockPool,
}));

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: MockPrismaPg,
}));

// ESM import — gets the mocked Pool from vi.mock('pg').
// require('pg') inside tests does NOT use Vitest's mock interceptor.
import { Pool } from 'pg';
import { PrismaService } from './prisma.service';

describe('PrismaService (factory multi-tenant)', () => {
  let service: PrismaService;
  const masterUrl = 'postgresql://user:pass@localhost:5432/soporte_master';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PrismaService(masterUrl);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('getMasterClient()', () => {
    it('should return the master PrismaClient singleton', () => {
      const client1 = service.getMasterClient();
      const client2 = service.getMasterClient();

      expect(client1).toBeDefined();
      expect(client1).toBe(client2); // mismo singleton
    });
  });

  describe('getTenantClient(dbName)', () => {
    it('should return a PrismaClient for the given dbName', () => {
      const client = service.getTenantClient('cliente_acme');
      expect(client).toBeDefined();
    });

    it('should cache and return the same client for the same dbName', () => {
      const client1 = service.getTenantClient('cliente_acme');
      const client2 = service.getTenantClient('cliente_acme');

      expect(client1).toBe(client2); // cached — mismo objeto
    });

    it('should create a different client for a different dbName', () => {
      const clientA = service.getTenantClient('tenant_a');
      const clientB = service.getTenantClient('tenant_b');

      expect(clientA).not.toBe(clientB); // clientes distintos
    });

    it('should call buildTenantUrl with the correct dbName', () => {
      const buildUrlSpy = vi.spyOn(service, 'buildTenantUrl');
      service.getTenantClient('nuevo_tenant');

      expect(buildUrlSpy).toHaveBeenCalledWith('nuevo_tenant');
    });
  });

  describe('buildTenantUrl(dbName)', () => {
    it('should replace the database name in the master URL', () => {
      const tenantUrl = service.buildTenantUrl('cliente_xyz');

      // La URL master tenía 'soporte_master' como nombre de DB;
      // la URL tenant debe tener 'cliente_xyz'.
      expect(tenantUrl).toContain('cliente_xyz');
      expect(tenantUrl).not.toContain('soporte_master');
    });

    it('should preserve host, port, user and password from master URL', () => {
      const tenantUrl = service.buildTenantUrl('other_db');

      expect(tenantUrl).toContain('user:pass@localhost:5432');
    });
  });

  describe('onModuleDestroy()', () => {
    it('should disconnect master client on destroy', async () => {
      const masterClient = service.getMasterClient() as any;
      await service.onModuleDestroy();

      expect(masterClient.$disconnect).toHaveBeenCalled();
    });

    it('should disconnect all cached tenant clients on destroy', async () => {
      const tenantA = service.getTenantClient('tenant_a') as any;
      const tenantB = service.getTenantClient('tenant_b') as any;

      await service.onModuleDestroy();

      expect(tenantA.$disconnect).toHaveBeenCalled();
      expect(tenantB.$disconnect).toHaveBeenCalled();
    });

    it('should call pool.end() on master pool to close TCP connections', async () => {
      // Pool es el MockPool importado vía ESM (vi.mock intercepta los imports ESM,
      // no los require() CJS — usar siempre el import estático del top del archivo).
      const PoolMock = Pool as unknown as vi.Mock;
      // results[0] = masterPool (instanciado en el constructor de PrismaService)
      const masterPoolInstance = PoolMock.mock.results[0].value as { end: vi.Mock };

      await service.onModuleDestroy();

      expect(masterPoolInstance.end).toHaveBeenCalled();
    });

    it('should call pool.end() on all tenant pools to close TCP connections', async () => {
      service.getTenantClient('tenant_a');
      service.getTenantClient('tenant_b');

      const PoolMock = Pool as unknown as vi.Mock;
      // results[0] = masterPool, results[1] = tenant_a, results[2] = tenant_b
      const tenantAPool = PoolMock.mock.results[1].value as { end: vi.Mock };
      const tenantBPool = PoolMock.mock.results[2].value as { end: vi.Mock };

      await service.onModuleDestroy();

      expect(tenantAPool.end).toHaveBeenCalled();
      expect(tenantBPool.end).toHaveBeenCalled();
    });
  });
});
