/**
 * PrismaConfiguracionRepository — unit tests (GREEN, tarea 4.10).
 *
 * Cubre el contrato de `IConfiguracionRepository` con `PrismaService`
 * mockeado (mismo patrón que `config-resolver.adapter.spec.ts` /
 * `audit-log.adapter.spec.ts`):
 *   - scope tenant re-resuelve `dbName` desde `master.clientes` (R9).
 *   - scope global usa `getMasterClient()` directo.
 *   - `findByClave`/`upsert` usan `findFirst` — NUNCA `findUnique` (Dz9).
 *   - `upsert` decide `create` vs `update` según exista o no la fila.
 *   - Fallos de infra ⇒ `Result.fail(InfraConfigError)`, nunca throw.
 */
import { PrismaConfiguracionRepository } from './configuracion-repository.adapter';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { ConfigScope } from '../../../domain/events/configuracion-cambiada.event';
import { InfraConfigError } from '../../../domain/errors/config.errors';
import { UpsertConfiguracionInput } from '../../../domain/ports/i-configuracion-repository';

describe('PrismaConfiguracionRepository', () => {
  let adapter: PrismaConfiguracionRepository;

  const mockGlobalFindMany = vi.fn();
  const mockGlobalFindFirst = vi.fn();
  const mockGlobalCreate = vi.fn();
  const mockGlobalUpdate = vi.fn();
  const mockTenantFindMany = vi.fn();
  const mockTenantFindFirst = vi.fn();
  const mockTenantCreate = vi.fn();
  const mockTenantUpdate = vi.fn();
  const mockGetTenantClient = vi.fn();
  const mockClienteFindFirst = vi.fn();

  const mockMasterClient = {
    configuracionRuntime: {
      findMany: mockGlobalFindMany,
      findFirst: mockGlobalFindFirst,
      create: mockGlobalCreate,
      update: mockGlobalUpdate,
    },
    cliente: { findFirst: mockClienteFindFirst },
  };

  const mockPrismaService = {
    getMasterClient: vi.fn().mockReturnValue(mockMasterClient),
    getTenantClient: mockGetTenantClient,
  } as PrismaService;

  const CLIENTE_ID_A = 'cliente-uuid-a';
  const SCOPE_GLOBAL: ConfigScope = { kind: 'global' };
  const SCOPE_TENANT: ConfigScope = { kind: 'tenant', clienteId: CLIENTE_ID_A };

  const filaPersistida = {
    id: 'row-uuid-1',
    categoria: 'smtp',
    clave: 'host',
    valor: 'smtp.ejemplo.com',
    tipo: 'string',
    esSecreto: false,
    iv: null,
    authTag: null,
    actualizadoPor: 'actor-uuid',
    createdAt: new Date('2026-07-30T00:00:00.000Z'),
    updatedAt: new Date('2026-07-30T00:00:00.000Z'),
  };

  const upsertInput: UpsertConfiguracionInput = {
    categoria: 'smtp',
    clave: 'host',
    valor: 'smtp.nuevo.com',
    tipo: 'string',
    esSecreto: false,
    iv: null,
    authTag: null,
    actualizadoPor: 'actor-uuid',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantClient.mockReturnValue({
      configuracionRuntime: {
        findMany: mockTenantFindMany,
        findFirst: mockTenantFindFirst,
        create: mockTenantCreate,
        update: mockTenantUpdate,
      },
    });
    mockClienteFindFirst.mockResolvedValue({ dbName: 'tenant_a_db' });
    adapter = new PrismaConfiguracionRepository(mockPrismaService);
  });

  describe('findAll', () => {
    it('scope global lista vía getMasterClient(), sin tocar getTenantClient', async () => {
      mockGlobalFindMany.mockResolvedValue([filaPersistida]);

      const result = await adapter.findAll(SCOPE_GLOBAL, 'smtp');

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toHaveLength(1);
      expect(mockGlobalFindMany).toHaveBeenCalledWith({
        where: { deletedAt: null, categoria: 'smtp' },
      });
      expect(mockGetTenantClient).not.toHaveBeenCalled();
    });

    it('scope tenant resuelve dbName por clienteId y lista vía getTenantClient(dbName)', async () => {
      mockTenantFindMany.mockResolvedValue([filaPersistida]);

      const result = await adapter.findAll(SCOPE_TENANT);

      expect(result.isOk()).toBe(true);
      expect(mockClienteFindFirst).toHaveBeenCalledWith({
        where: { id: CLIENTE_ID_A, activo: true, deletedAt: null },
        select: { dbName: true },
      });
      expect(mockGetTenantClient).toHaveBeenCalledWith('tenant_a_db');
      expect(mockTenantFindMany).toHaveBeenCalledWith({ where: { deletedAt: null } });
      expect(mockGlobalFindMany).not.toHaveBeenCalled();
    });

    it('falla de infra en findMany ⇒ Result.fail(InfraConfigError), nunca throw', async () => {
      mockGlobalFindMany.mockRejectedValue(new Error('conexión caída'));

      const result = await adapter.findAll(SCOPE_GLOBAL);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(InfraConfigError);
    });

    it('clienteId inexistente/inactivo ⇒ Result.fail(InfraConfigError), nunca llama getTenantClient', async () => {
      mockClienteFindFirst.mockResolvedValue(null);

      const result = await adapter.findAll(SCOPE_TENANT);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(InfraConfigError);
      expect(mockGetTenantClient).not.toHaveBeenCalled();
    });
  });

  describe('findByClave', () => {
    it('usa findFirst (NUNCA findUnique) — scope global', async () => {
      mockGlobalFindFirst.mockResolvedValue(filaPersistida);

      const result = await adapter.findByClave(SCOPE_GLOBAL, 'smtp', 'host');

      expect(result.isOk()).toBe(true);
      expect(result.getValue()?.clave).toBe('host');
      expect(mockGlobalFindFirst).toHaveBeenCalledWith({
        where: { categoria: 'smtp', clave: 'host', deletedAt: null },
      });
    });

    it('usa findFirst (NUNCA findUnique) — scope tenant, resuelve dbName', async () => {
      mockTenantFindFirst.mockResolvedValue(filaPersistida);

      const result = await adapter.findByClave(SCOPE_TENANT, 'smtp', 'host');

      expect(result.isOk()).toBe(true);
      expect(mockGetTenantClient).toHaveBeenCalledWith('tenant_a_db');
      expect(mockTenantFindFirst).toHaveBeenCalledWith({
        where: { categoria: 'smtp', clave: 'host', deletedAt: null },
      });
    });

    it('sin fila activa ⇒ Result.ok(null)', async () => {
      mockGlobalFindFirst.mockResolvedValue(null);

      const result = await adapter.findByClave(SCOPE_GLOBAL, 'smtp', 'inexistente');

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBeNull();
    });

    it('falla de infra ⇒ Result.fail(InfraConfigError)', async () => {
      mockGlobalFindFirst.mockRejectedValue(new Error('timeout'));

      const result = await adapter.findByClave(SCOPE_GLOBAL, 'smtp', 'host');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(InfraConfigError);
    });
  });

  describe('upsert', () => {
    it('sin fila previa activa ⇒ create() — scope global', async () => {
      mockGlobalFindFirst.mockResolvedValue(null);
      mockGlobalCreate.mockResolvedValue({ ...filaPersistida, valor: 'smtp.nuevo.com' });

      const result = await adapter.upsert(SCOPE_GLOBAL, upsertInput);

      expect(result.isOk()).toBe(true);
      expect(mockGlobalCreate).toHaveBeenCalledTimes(1);
      expect(mockGlobalUpdate).not.toHaveBeenCalled();
      const [{ data }] = mockGlobalCreate.mock.calls[0];
      expect(data.categoria).toBe('smtp');
      expect(data.clave).toBe('host');
      expect(data.valor).toBe('smtp.nuevo.com');
    });

    it('con fila previa activa ⇒ update() por id — scope global', async () => {
      mockGlobalFindFirst.mockResolvedValue(filaPersistida);
      mockGlobalUpdate.mockResolvedValue({ ...filaPersistida, valor: 'smtp.nuevo.com' });

      const result = await adapter.upsert(SCOPE_GLOBAL, upsertInput);

      expect(result.isOk()).toBe(true);
      expect(mockGlobalUpdate).toHaveBeenCalledWith({
        where: { id: filaPersistida.id },
        data: expect.objectContaining({ valor: 'smtp.nuevo.com' }),
      });
      expect(mockGlobalCreate).not.toHaveBeenCalled();
    });

    it('scope tenant resuelve dbName y opera vía getTenantClient(dbName)', async () => {
      mockTenantFindFirst.mockResolvedValue(null);
      mockTenantCreate.mockResolvedValue(filaPersistida);

      const result = await adapter.upsert(SCOPE_TENANT, upsertInput);

      expect(result.isOk()).toBe(true);
      expect(mockGetTenantClient).toHaveBeenCalledWith('tenant_a_db');
      expect(mockTenantCreate).toHaveBeenCalledTimes(1);
      expect(mockGlobalCreate).not.toHaveBeenCalled();
    });

    it('lookup interno usa findFirst, NUNCA findUnique (Dz9)', async () => {
      mockGlobalFindFirst.mockResolvedValue(null);
      mockGlobalCreate.mockResolvedValue(filaPersistida);

      await adapter.upsert(SCOPE_GLOBAL, upsertInput);

      expect(mockGlobalFindFirst).toHaveBeenCalledWith({
        where: { categoria: 'smtp', clave: 'host', deletedAt: null },
      });
    });

    it('falla de infra en create/update ⇒ Result.fail(InfraConfigError)', async () => {
      mockGlobalFindFirst.mockResolvedValue(null);
      mockGlobalCreate.mockRejectedValue(new Error('constraint violado'));

      const result = await adapter.upsert(SCOPE_GLOBAL, upsertInput);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(InfraConfigError);
    });

    it('clienteId inexistente/inactivo ⇒ Result.fail, nunca llama getTenantClient', async () => {
      mockClienteFindFirst.mockResolvedValue(null);

      const result = await adapter.upsert(SCOPE_TENANT, upsertInput);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(InfraConfigError);
      expect(mockGetTenantClient).not.toHaveBeenCalled();
    });
  });
});
