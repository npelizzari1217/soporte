/**
 * prisma.service.spec.ts — TDD RED phase
 *
 * Tests del factory multi-tenant de PrismaService.
 * No necesita Postgres real — mockeamos PrismaClient y Pool de pg.
 * Tarea: 0.C.3
 */

// ---- Mocks ----
// Mockear PrismaClient del master ANTES del import de prisma.service
// para que el módulo use el mock.

jest.mock('./prisma-clients', () => ({
  MasterPrismaClient: jest.fn().mockImplementation(() => ({
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $transaction: jest.fn(),
    masterSeedVersion: {},
  })),
  TenantPrismaClient: jest.fn().mockImplementation(() => ({
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $transaction: jest.fn(),
    tenantSeedVersion: {},
  })),
}));

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation(() => ({})),
}));

import { PrismaService } from './prisma.service';

describe('PrismaService (factory multi-tenant)', () => {
  let service: PrismaService;
  const masterUrl = 'postgresql://user:pass@localhost:5432/soporte_master';

  beforeEach(() => {
    jest.clearAllMocks();
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
      const buildUrlSpy = jest.spyOn(service, 'buildTenantUrl');
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
  });
});
