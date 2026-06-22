/**
 * tenant-context.spec.ts — TDD RED phase
 *
 * Tests de aislamiento de TenantContext basado en AsyncLocalStorage.
 * Tarea: 0.C.1
 */

import { TenantContext, TenantContextData } from './tenant-context';

// Mock de PrismaClient para no necesitar conexión real a DB
const makeMockClient = () => ({
  $transaction: jest.fn(),
  $disconnect: jest.fn(),
});

describe('TenantContext', () => {
  let tenantContext: TenantContext;

  beforeEach(() => {
    tenantContext = new TenantContext();
  });

  describe('run() + get()', () => {
    it('should store and retrieve context within the same run() scope', async () => {
      const mockClient = makeMockClient() as any;
      const ctx: TenantContextData = {
        prismaClient: mockClient,
        dbName: 'cliente_acme',
        clienteId: 'uuid-acme-123',
      };

      await tenantContext.run(ctx, async () => {
        const retrieved = tenantContext.get();

        expect(retrieved).toBeDefined();
        expect(retrieved?.dbName).toBe('cliente_acme');
        expect(retrieved?.clienteId).toBe('uuid-acme-123');
        expect(retrieved?.prismaClient).toBe(mockClient);
      });
    });

    it('should return undefined outside of run() scope', () => {
      const result = tenantContext.get();
      expect(result).toBeUndefined();
    });

    it('should isolate contexts between concurrent run() calls', async () => {
      const mockClientA = makeMockClient() as any;
      const mockClientB = makeMockClient() as any;

      const ctxA: TenantContextData = {
        prismaClient: mockClientA,
        dbName: 'tenant_a',
        clienteId: 'id-a',
      };

      const ctxB: TenantContextData = {
        prismaClient: mockClientB,
        dbName: 'tenant_b',
        clienteId: 'id-b',
      };

      // Ejecutamos ambos en paralelo y verificamos que no se mezclan
      const [resultA, resultB] = await Promise.all([
        tenantContext.run(ctxA, async () => {
          // Simula un pequeño delay para que los contextos se superpongan
          await new Promise((resolve) => setTimeout(resolve, 10));
          return tenantContext.get();
        }),
        tenantContext.run(ctxB, async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return tenantContext.get();
        }),
      ]);

      expect(resultA?.dbName).toBe('tenant_a');
      expect(resultB?.dbName).toBe('tenant_b');
    });

    it('should not leak context after run() completes', async () => {
      const mockClient = makeMockClient() as any;
      const ctx: TenantContextData = {
        prismaClient: mockClient,
        dbName: 'temporal_db',
        clienteId: 'uuid-temp',
      };

      await tenantContext.run(ctx, async () => {
        expect(tenantContext.get()).toBeDefined();
      });

      // Después de que run() completa, el contexto no debe estar disponible
      expect(tenantContext.get()).toBeUndefined();
    });
  });

  describe('getClient()', () => {
    it('should return the prismaClient from the active context', async () => {
      const mockClient = makeMockClient() as any;
      const ctx: TenantContextData = {
        prismaClient: mockClient,
        dbName: 'my_db',
        clienteId: 'my-id',
      };

      await tenantContext.run(ctx, async () => {
        const client = tenantContext.getClient();
        expect(client).toBe(mockClient);
      });
    });

    it('should throw if called outside of a tenant context (no active run)', () => {
      expect(() => tenantContext.getClient()).toThrow(
        'No hay TenantContext activo. ¿Falta TenantGuard o TenantMiddleware?',
      );
    });
  });
});
