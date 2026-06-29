import { EliminarComponenteUseCase, EliminarComponenteDto } from './eliminar-componente.use-case';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeComponente(id: string, deletedAt: Date | null = null): ComponenteEquipoEntity {
  return ComponenteEquipoEntity.reconstitute(
    {
      equipoId: 'eq-001',
      tipoComponenteId: 'tc-001',
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    },
    id,
    new Date(),
    new Date(),
    deletedAt,
  );
}

// ─── Constantes de test ───────────────────────────────────────────────────────

const COMPONENTE_ID = 'co000000-0000-4000-c000-000000000001';

const validDto: EliminarComponenteDto = {
  componenteId: COMPONENTE_ID,
};

// ─── Suite principal ──────────────────────────────────────────────────────────

describe('EliminarComponenteUseCase', () => {
  let useCase: EliminarComponenteUseCase;

  const mockComponenteRepo = {
    findById: vi.fn(),
    findByEquipoId: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  } satisfies vi.Mocked<IComponenteEquipoRepository>;

  const mockTxRunner: ITenantTransactionRunner = {
    run: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockComponenteRepo.findById.mockResolvedValue(makeComponente(COMPONENTE_ID));
    mockComponenteRepo.delete.mockResolvedValue(undefined);
    (mockTxRunner.run as vi.Mock).mockImplementation((fn: () => Promise<unknown>) => fn());

    useCase = new EliminarComponenteUseCase(mockComponenteRepo, mockTxRunner);
  });

  // ─── Componente no encontrado ─────────────────────────────────────────────

  describe('componente no encontrado', () => {
    it('retorna fallo cuando el componente no existe', async () => {
      mockComponenteRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('COMPONENTE_EQUIPO_NO_ENCONTRADO');
    });

    it('retorna fallo cuando el componente ya fue soft-deleted', async () => {
      mockComponenteRepo.findById.mockResolvedValue(makeComponente(COMPONENTE_ID, new Date()));

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('COMPONENTE_EQUIPO_NO_ENCONTRADO');
    });

    it('no llama a delete cuando el componente no existe', async () => {
      mockComponenteRepo.findById.mockResolvedValue(null);

      await useCase.execute(validDto);

      expect(mockComponenteRepo.delete).not.toHaveBeenCalled();
    });
  });

  // ─── Soft delete del componente ───────────────────────────────────────────

  describe('soft delete del componente', () => {
    it('llama a delete del componente con el id correcto', async () => {
      await useCase.execute(validDto);

      expect(mockComponenteRepo.delete).toHaveBeenCalledWith(COMPONENTE_ID);
    });

    it('llama a delete exactamente una vez', async () => {
      await useCase.execute(validDto);

      expect(mockComponenteRepo.delete).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('retorna Result.ok cuando la eliminación es exitosa', async () => {
      const result = await useCase.execute(validDto);

      expect(result.isOk()).toBe(true);
    });

    it('el delete ocurre DENTRO del callback del txRunner', async () => {
      const callOrder: string[] = [];
      (mockTxRunner.run as vi.Mock).mockImplementation(async (fn: () => Promise<unknown>) => {
        callOrder.push('tx:start');
        const r = await fn();
        callOrder.push('tx:end');
        return r;
      });
      mockComponenteRepo.delete.mockImplementation(async () => {
        callOrder.push('componente:delete');
      });

      await useCase.execute(validDto);

      expect(callOrder.indexOf('tx:start')).toBeLessThan(callOrder.indexOf('componente:delete'));
      expect(callOrder.indexOf('tx:end')).toBeGreaterThan(callOrder.indexOf('componente:delete'));
    });
  });
});
