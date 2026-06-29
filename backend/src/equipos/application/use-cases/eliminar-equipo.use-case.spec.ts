import { EliminarEquipoUseCase, EliminarEquipoDto } from './eliminar-equipo.use-case';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEquipo(id: string, activo: boolean, deletedAt: Date | null): EquipoInformaticoEntity {
  return EquipoInformaticoEntity.reconstitute(
    {
      nombre: `Equipo ${id}`,
      numeroSerie: null,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacionId: null,
      asignadoAId: null,
      activo,
    },
    id,
    new Date(),
    new Date(),
    deletedAt,
  );
}

// ─── Constantes de test ───────────────────────────────────────────────────────

const EQUIPO_ID = 'eq000000-0000-4000-e000-000000000001';

const validDto: EliminarEquipoDto = {
  equipoId: EQUIPO_ID,
};

// ─── Suite principal ──────────────────────────────────────────────────────────

describe('EliminarEquipoUseCase', () => {
  let useCase: EliminarEquipoUseCase;

  const mockEquipoRepo = {
    findById: vi.fn(),
    findByNumeroSerie: vi.fn(),
    findAllActive: vi.fn(),
    findByAsignadoAId: vi.fn(),
    save: vi.fn<Promise<void>, [EquipoInformaticoEntity]>(),
    delete: vi.fn(),
  } satisfies vi.Mocked<IEquipoInformaticoRepository>;

  const mockTxRunner: ITenantTransactionRunner = {
    run: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockEquipoRepo.findById.mockResolvedValue(makeEquipo(EQUIPO_ID, true, null));
    mockEquipoRepo.delete.mockResolvedValue(undefined);
    (mockTxRunner.run as vi.Mock).mockImplementation((fn: () => Promise<unknown>) => fn());

    useCase = new EliminarEquipoUseCase(mockEquipoRepo, mockTxRunner);
  });

  // ─── Equipo no encontrado ─────────────────────────────────────────────────

  describe('equipo no encontrado', () => {
    it('retorna fallo cuando el equipo no existe', async () => {
      mockEquipoRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('EQUIPO_INFORMATICO_NO_ENCONTRADO');
    });

    it('retorna fallo cuando el equipo ya fue soft-deleted', async () => {
      mockEquipoRepo.findById.mockResolvedValue(makeEquipo(EQUIPO_ID, true, new Date()));

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('EQUIPO_INFORMATICO_NO_ENCONTRADO');
    });

    it('no llama a delete cuando el equipo no existe', async () => {
      mockEquipoRepo.findById.mockResolvedValue(null);

      await useCase.execute(validDto);

      expect(mockEquipoRepo.delete).not.toHaveBeenCalled();
    });
  });

  // ─── Soft delete sin cascade a tickets ───────────────────────────────────

  describe('soft delete sin cascade a tickets', () => {
    it('llama a delete (soft) del equipo, NOT a delete de tickets', async () => {
      await useCase.execute(validDto);

      expect(mockEquipoRepo.delete).toHaveBeenCalledWith(EQUIPO_ID);
    });

    it('llama a delete exactamente una vez', async () => {
      await useCase.execute(validDto);

      expect(mockEquipoRepo.delete).toHaveBeenCalledTimes(1);
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
      mockEquipoRepo.delete.mockImplementation(async () => {
        callOrder.push('equipo:delete');
      });

      await useCase.execute(validDto);

      expect(callOrder.indexOf('tx:start')).toBeLessThan(callOrder.indexOf('equipo:delete'));
      expect(callOrder.indexOf('tx:end')).toBeGreaterThan(callOrder.indexOf('equipo:delete'));
    });
  });
});
