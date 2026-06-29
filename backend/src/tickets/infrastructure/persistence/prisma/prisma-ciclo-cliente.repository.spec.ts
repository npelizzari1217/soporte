/**
 * S2-T6 TEST — Unit tests de PrismaCicloClienteRepository (RED → GREEN con S2-T7)
 *
 * Verifica que findById delega en el cliente Prisma del tenant y reconstituye
 * la entidad correctamente. Mock de TenantContext para aislar la DB.
 */
import { PrismaCicloClienteRepository } from './prisma-ciclo-cliente.repository';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { CicloClienteEntity } from '../../../domain/entities/ciclo-cliente.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CICLO_ID = 'ciclo-uuid-00001';
const CICLO_VIGENTE_ID = 'vigente-uuid-001';

function makePrismaCicloRow(overrides: Partial<ReturnType<typeof buildRow>> = {}) {
  return buildRow(overrides);
}

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

describe('PrismaCicloClienteRepository', () => {
  let repository: PrismaCicloClienteRepository;

  const mockCicloCliente = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
  };

  const mockPrisma = {
    cicloCliente: mockCicloCliente,
  };

  const mockTenantContext = {
    getClient: vi.fn().mockReturnValue(mockPrisma),
  } as unknown as TenantContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantContext.getClient = vi.fn().mockReturnValue(mockPrisma);
    repository = new PrismaCicloClienteRepository(mockTenantContext);
  });

  describe('findById(id)', () => {
    it('retorna null cuando no existe un ciclo con ese id', async () => {
      mockCicloCliente.findUnique.mockResolvedValue(null);

      const result = await repository.findById('non-existent-uuid');

      expect(result).toBeNull();
      expect(mockCicloCliente.findUnique).toHaveBeenCalledWith({
        where: { id: 'non-existent-uuid' },
      });
    });

    it('retorna CicloClienteEntity con props correctas cuando existe', async () => {
      const row = makePrismaCicloRow();
      mockCicloCliente.findUnique.mockResolvedValue(row);

      const result = await repository.findById(CICLO_ID);

      expect(result).toBeInstanceOf(CicloClienteEntity);
      expect(result!.id).toBe(CICLO_ID);
      expect(result!.cicloVigenteId).toBe(CICLO_VIGENTE_ID);
      expect(result!.nombre).toBe('Ciclo 2026');
      expect(result!.activo).toBe(true);
      expect(result!.fechaInicio.getTime()).toBe(row.fechaInicio.getTime());
      expect(result!.fechaFin.getTime()).toBe(row.fechaFin.getTime());
      expect(result!.isDeleted()).toBe(false);
    });

    it('reconstituye deletedAt cuando el ciclo está soft-deleted', async () => {
      const deletedAt = new Date('2026-06-01');
      const row = makePrismaCicloRow({ deletedAt });
      mockCicloCliente.findUnique.mockResolvedValue(row);

      const result = await repository.findById(CICLO_ID);

      expect(result!.isDeleted()).toBe(true);
      expect(result!.deletedAt?.getTime()).toBe(deletedAt.getTime());
    });
  });
});
