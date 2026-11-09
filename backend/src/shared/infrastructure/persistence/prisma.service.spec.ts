/**
 * prisma.service.spec.ts — TDD RED phase (T5.2, PR5).
 *
 * Tests del factory multi-tenant de PrismaService. No necesita Postgres real
 * — mockeamos PrismaClient y Pool de pg. La implementación fue scaffoldeada
 * junto con el resto del andamiaje del proyecto (foundation scaffold, previo
 * a la Fase 1 SDD) — este spec la ejerce por primera vez con cobertura
 * formal, adaptado del patrón probado en soporte1
 * (`shared/infrastructure/persistence/prisma.service.spec.ts`).
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
        usuario: {},
      };
    }),
    MockTenantPrismaClient: vi.fn().mockImplementation(function () {
      return {
        $disconnect: vi.fn().mockResolvedValue(undefined),
        $transaction: vi.fn(),
        ticket: {},
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
// require('pg') dentro de los tests NO usa el interceptor de mocks de Vitest.
import { Pool } from 'pg';
import {
  ESPERA_CONEXION_MS,
  OCIOSA_MS,
  PrismaService,
  TOPE_POOL_MASTER,
  TOPE_POOL_TENANT,
} from './prisma.service';

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

  describe('tope de conexiones por pool (Postgres compartido del VPS)', () => {
    // Postgres atiende a varios sistemas con max_connections=100. Sin tope, cada pool de pg abre
    // hasta 10 conexiones: master + 9 tenants llegaban a 100 y el servidor rechazaba con 53300.
    it('el pool master tiene un tope, cierra las ociosas y no espera para siempre', () => {
      const opciones = vi.mocked(Pool).mock.calls[0][0];

      expect(opciones).toEqual(
        expect.objectContaining({
          max: TOPE_POOL_MASTER,
          idleTimeoutMillis: OCIOSA_MS,
          connectionTimeoutMillis: ESPERA_CONEXION_MS,
        }),
      );
    });

    it('cada pool de tenant tiene su tope y cierra las conexiones ociosas', () => {
      service.getTenantClient('tenant_a');
      service.getTenantClient('tenant_b');

      const [, tenantA, tenantB] = vi.mocked(Pool).mock.calls.map((llamada) => llamada[0]);
      for (const opciones of [tenantA, tenantB]) {
        expect(opciones).toEqual(
          expect.objectContaining({
            max: TOPE_POOL_TENANT,
            idleTimeoutMillis: OCIOSA_MS,
            connectionTimeoutMillis: ESPERA_CONEXION_MS,
          }),
        );
      }
    });

    it('con 9 tenants activos, soporte no pasa de 50 conexiones', () => {
      expect(TOPE_POOL_MASTER + 9 * TOPE_POOL_TENANT).toBeLessThanOrEqual(50);
    });
  });

  describe('onModuleDestroy()', () => {
    it('should disconnect master client on destroy', async () => {
      const masterClient = service.getMasterClient();
      await service.onModuleDestroy();

      expect(masterClient.$disconnect).toHaveBeenCalled();
    });

    it('should disconnect all cached tenant clients on destroy', async () => {
      const tenantA = service.getTenantClient('tenant_a');
      const tenantB = service.getTenantClient('tenant_b');

      await service.onModuleDestroy();

      expect(tenantA.$disconnect).toHaveBeenCalled();
      expect(tenantB.$disconnect).toHaveBeenCalled();
    });

    it('should call pool.end() on master pool to close TCP connections', async () => {
      // Pool es el MockPool importado vía ESM (vi.mock intercepta los imports
      // ESM, no los require() CJS — usar siempre el import estático del top
      // del archivo).
      const PoolMock = vi.mocked(Pool);
      // results[0] = masterPool (instanciado en el constructor de PrismaService)
      const masterPoolInstance = PoolMock.mock.results[0].value;

      await service.onModuleDestroy();

      expect(masterPoolInstance.end).toHaveBeenCalled();
    });

    it('should call pool.end() on all tenant pools to close TCP connections', async () => {
      service.getTenantClient('tenant_a');
      service.getTenantClient('tenant_b');

      const PoolMock = vi.mocked(Pool);
      // results[0] = masterPool, results[1] = tenant_a, results[2] = tenant_b
      const tenantAPool = PoolMock.mock.results[1].value;
      const tenantBPool = PoolMock.mock.results[2].value;

      await service.onModuleDestroy();

      expect(tenantAPool.end).toHaveBeenCalled();
      expect(tenantBPool.end).toHaveBeenCalled();
    });
  });
});
