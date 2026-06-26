/**
 * Unit tests — TenantSeederAdapter (Parte A, Batch 4)
 *
 * Verifica que el adapter:
 * 1. Crea un Pool con la URL del tenant derivada del masterUrl + dbName.
 * 2. Ejecuta exactamente 5 queries SQL (una por catálogo: estados, prioridades,
 *    tipos_ticket, tipo_operacion, tipos_componente).
 * 3. Cierra el Pool antes de retornar — CONTRATO CRÍTICO (permite DROP DATABASE).
 *    También cierra si una query falla.
 *
 * PoolFactory es injectable para tests unitarios sin pg real.
 *
 * Ref spec: [SPEC:clientes/Seed de catálogos por tenant es idempotente]
 * Ref spec: [SPEC:tickets-core/Nuevo tenant tiene catálogos pre-poblados]
 * Tarea: Batch 4 Parte A (adapter ITenantSeeder)
 */
import { TenantSeederAdapter, PoolFactory } from './tenant-seeder.adapter';

// ─── Mock de pg.Pool ──────────────────────────────────────────────────────────
interface MockPool {
  query: jest.MockedFunction<(sql: string) => Promise<unknown>>;
  end: jest.MockedFunction<() => Promise<void>>;
}

function makeMockPool(): MockPool {
  return {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    end: jest.fn().mockResolvedValue(undefined),
  };
}

describe('TenantSeederAdapter (unit)', () => {
  const MASTER_URL = 'postgresql://user:pass@host:5432/soporte_master';
  let mockPool: MockPool;
  let poolFactory: jest.MockedFunction<PoolFactory>;
  let adapter: TenantSeederAdapter;

  beforeEach(() => {
    mockPool = makeMockPool();
    poolFactory = jest.fn().mockReturnValue(mockPool);
    adapter = new TenantSeederAdapter(MASTER_URL, poolFactory as PoolFactory);
  });

  // ─── URL derivada ──────────────────────────────────────────────────────────

  describe('pool factory', () => {
    it('creates pool with tenant URL (masterUrl con el dbName reemplazado)', async () => {
      await adapter.seed('tenant_acme');
      expect(poolFactory).toHaveBeenCalledTimes(1);
      expect(poolFactory).toHaveBeenCalledWith('postgresql://user:pass@host:5432/tenant_acme');
    });

    it('handles dbName with underscores and numbers', async () => {
      await adapter.seed('soporte_e2e_99');
      expect(poolFactory).toHaveBeenCalledWith('postgresql://user:pass@host:5432/soporte_e2e_99');
    });

    it('creates a new pool per seed call (no singleton)', async () => {
      await adapter.seed('tenant_a');
      await adapter.seed('tenant_b');
      expect(poolFactory).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Número de queries ─────────────────────────────────────────────────────

  describe('seed queries', () => {
    it('executes exactly 5 queries (one per catalog)', async () => {
      await adapter.seed('tenant_acme');
      expect(mockPool.query).toHaveBeenCalledTimes(5);
    });

    it('seeds estados catalog (INSERT INTO estados)', async () => {
      await adapter.seed('tenant_acme');
      const sqls = mockPool.query.mock.calls.map(([sql]: [string]) => sql);
      expect(sqls.some((sql) => sql.toLowerCase().includes('estados'))).toBe(true);
    });

    it('seeds prioridades catalog', async () => {
      await adapter.seed('tenant_acme');
      const sqls = mockPool.query.mock.calls.map(([sql]: [string]) => sql);
      expect(sqls.some((sql) => sql.toLowerCase().includes('prioridades'))).toBe(true);
    });

    it('seeds tipos_ticket catalog', async () => {
      await adapter.seed('tenant_acme');
      const sqls = mockPool.query.mock.calls.map(([sql]: [string]) => sql);
      expect(sqls.some((sql) => sql.toLowerCase().includes('tipos_ticket'))).toBe(true);
    });

    it('seeds tipo_operacion catalog', async () => {
      await adapter.seed('tenant_acme');
      const sqls = mockPool.query.mock.calls.map(([sql]: [string]) => sql);
      expect(sqls.some((sql) => sql.toLowerCase().includes('tipo_operacion'))).toBe(true);
    });

    it('seeds tipos_componente catalog', async () => {
      await adapter.seed('tenant_acme');
      const sqls = mockPool.query.mock.calls.map(([sql]: [string]) => sql);
      expect(sqls.some((sql) => sql.toLowerCase().includes('tipos_componente'))).toBe(true);
    });

    it('all queries use ON CONFLICT DO NOTHING (idempotencia)', async () => {
      await adapter.seed('tenant_acme');
      const sqls = mockPool.query.mock.calls.map(([sql]: [string]) => sql);
      for (const sql of sqls) {
        expect(sql.toLowerCase()).toContain('on conflict');
        expect(sql.toLowerCase()).toContain('do nothing');
      }
    });
  });

  // ─── Cierre del pool (CONTRATO CRÍTICO) ──────────────────────────────────

  describe('pool lifecycle (contrato de conexiones)', () => {
    it('closes pool after all queries succeed', async () => {
      await adapter.seed('tenant_acme');
      expect(mockPool.end).toHaveBeenCalledTimes(1);
    });

    it('closes pool even if a query fails (try/finally)', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('INSERT failed'));
      await expect(adapter.seed('tenant_acme')).rejects.toThrow('INSERT failed');
      expect(mockPool.end).toHaveBeenCalledTimes(1);
    });

    it('pool.end is called AFTER all queries (call order)', async () => {
      const callOrder: string[] = [];
      mockPool.query.mockImplementation(async () => {
        callOrder.push('query');
        return { rows: [], rowCount: 0 };
      });
      mockPool.end.mockImplementation(async () => {
        callOrder.push('end');
      });

      await adapter.seed('tenant_acme');

      expect(callOrder[callOrder.length - 1]).toBe('end');
      expect(callOrder.filter((c) => c === 'query')).toHaveLength(5);
      expect(callOrder.filter((c) => c === 'end')).toHaveLength(1);
    });
  });
});
