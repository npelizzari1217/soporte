/**
 * T3.4 [RED] — Unit tests de PrismaCicloClienteRepository (admin).
 *
 * Cubre:
 * - toDomain mapea row.cicloVigenteId → entity.cicloVigenteId (requiere T3.1).
 * - save().create persiste cicloVigenteId REAL (ciclo.cicloVigenteId), no ciclo.id
 *   (elimina el placeholder, ADR-5).
 * - findActive() consulta findFirst({ activo: true, deletedAt: null }) y mapea.
 * - findActive() retorna null si no hay ninguno activo.
 *
 * Mock de TenantContext para aislar la DB (mismo patrón que
 * tickets/infrastructure/.../prisma-ciclo-cliente.repository.spec.ts).
 */
import { PrismaCicloClienteRepository } from './prisma-ciclo-cliente.repository';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { CicloClienteEntity } from '../../../domain/entities/ciclo-cliente.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CICLO_ID = 'ciclo-uuid-00001';
const CICLO_VIGENTE_ID = 'vigente-uuid-001';

function buildRow(
  overrides: Partial<{
    id: string;
    cicloVigenteId: string;
    nombre: string;
    fechaInicio: Date;
    fechaFin: Date;
    activo: boolean;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  }> = {},
) {
  return {
    id: CICLO_ID,
    cicloVigenteId: CICLO_VIGENTE_ID,
    nombre: 'Ciclo 2026',
    fechaInicio: new Date('2026-01-01'),
    fechaFin: new Date('2026-12-31'),
    activo: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('PrismaCicloClienteRepository (admin) — T3.4', () => {
  let repository: PrismaCicloClienteRepository;

  const mockCicloCliente = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
  };

  const mockClient = {
    cicloCliente: mockCicloCliente,
    $transaction: vi.fn(),
  };

  const mockTenantContext = {
    getClient: vi.fn().mockReturnValue(mockClient),
  } as unknown as TenantContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantContext.getClient = vi.fn().mockReturnValue(mockClient);
    repository = new PrismaCicloClienteRepository(mockTenantContext);
  });

  describe('toDomain (via findById)', () => {
    it('mapea row.cicloVigenteId → entity.cicloVigenteId', async () => {
      const row = buildRow();
      mockCicloCliente.findUnique.mockResolvedValue(row);

      const result = await repository.findById(CICLO_ID);

      expect(result).toBeInstanceOf(CicloClienteEntity);
      expect(result!.cicloVigenteId).toBe(CICLO_VIGENTE_ID);
    });
  });

  describe('save() — create', () => {
    it('persiste cicloVigenteId REAL de la entidad, NO ciclo.id (elimina placeholder)', async () => {
      const ciclo = CicloClienteEntity.create({
        nombre: 'Ejercicio 2026',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: false,
        cicloVigenteId: CICLO_VIGENTE_ID,
      });
      mockCicloCliente.upsert.mockResolvedValue(buildRow());

      await repository.save(ciclo);

      expect(mockCicloCliente.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ cicloVigenteId: CICLO_VIGENTE_ID }),
        }),
      );
      const call = mockCicloCliente.upsert.mock.calls[0][0];
      expect(call.create.cicloVigenteId).not.toBe(ciclo.id);
      expect(ciclo.cicloVigenteId).not.toBe(ciclo.id);
    });
  });

  describe('findActive()', () => {
    it('consulta findFirst({ activo: true, deletedAt: null }) y mapea a entidad', async () => {
      const row = buildRow({ activo: true });
      mockCicloCliente.findFirst.mockResolvedValue(row);

      const result = await repository.findActive();

      expect(mockCicloCliente.findFirst).toHaveBeenCalledWith({
        where: { activo: true, deletedAt: null },
      });
      expect(result).toBeInstanceOf(CicloClienteEntity);
      expect(result!.id).toBe(CICLO_ID);
      expect(result!.activo).toBe(true);
    });

    it('retorna null si no hay ningún ciclo activo', async () => {
      mockCicloCliente.findFirst.mockResolvedValue(null);

      const result = await repository.findActive();

      expect(result).toBeNull();
    });
  });
});
