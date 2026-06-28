/**
 * S2-T8 TEST — Unit tests de PrismaPrioridadRepository (RED → GREEN con S2-T9)
 *
 * Verifica que findById delega en el cliente Prisma del tenant y reconstituye
 * la entidad correctamente. Mock de TenantContext para aislar la DB.
 */
import { PrismaPrioridadRepository } from './prisma-prioridad.repository';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { PrioridadEntity } from '../../../domain/entities/prioridad.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PRIORIDAD_ID = 'prioridad-uuid-001';

function makePrismaPrioridadRow(overrides: Partial<ReturnType<typeof buildRow>> = {}) {
  return buildRow(overrides);
}

function buildRow(overrides: Partial<{
  id: string;
  codigo: string;
  nombre: string;
  color: string | null;
  orden: number;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}> = {}) {
  return {
    id: PRIORIDAD_ID,
    codigo: 'MEDIA',
    nombre: 'Media',
    color: '#FFA500',
    orden: 2,
    activo: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('PrismaPrioridadRepository', () => {
  let repository: PrismaPrioridadRepository;

  const mockPrioridad = {
    findUnique: jest.fn(),
  };

  const mockPrisma = {
    prioridad: mockPrioridad,
  };

  const mockTenantContext = {
    getClient: jest.fn().mockReturnValue(mockPrisma),
  } as unknown as TenantContext;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTenantContext.getClient = jest.fn().mockReturnValue(mockPrisma);
    repository = new PrismaPrioridadRepository(mockTenantContext);
  });

  describe('findById(id)', () => {
    it('retorna null cuando no existe una prioridad con ese id', async () => {
      mockPrioridad.findUnique.mockResolvedValue(null);

      const result = await repository.findById('non-existent-uuid');

      expect(result).toBeNull();
      expect(mockPrioridad.findUnique).toHaveBeenCalledWith({
        where: { id: 'non-existent-uuid' },
      });
    });

    it('retorna PrioridadEntity con props correctas cuando existe', async () => {
      const row = makePrismaPrioridadRow();
      mockPrioridad.findUnique.mockResolvedValue(row);

      const result = await repository.findById(PRIORIDAD_ID);

      expect(result).toBeInstanceOf(PrioridadEntity);
      expect(result!.id).toBe(PRIORIDAD_ID);
      expect(result!.codigo).toBe('MEDIA');
      expect(result!.nombre).toBe('Media');
      expect(result!.color).toBe('#FFA500');
      expect(result!.orden).toBe(2);
      expect(result!.activo).toBe(true);
      expect(result!.isDeleted()).toBe(false);
    });

    it('maneja color null correctamente', async () => {
      const row = makePrismaPrioridadRow({ color: null });
      mockPrioridad.findUnique.mockResolvedValue(row);

      const result = await repository.findById(PRIORIDAD_ID);

      expect(result!.color).toBeNull();
    });
  });
});
