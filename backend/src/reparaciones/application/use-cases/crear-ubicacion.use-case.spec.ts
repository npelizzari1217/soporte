import { CrearUbicacionUseCase, CrearUbicacionDto } from './crear-ubicacion.use-case';
import { IUbicacionRepository } from '../../domain/ports/i-ubicacion.repository';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { UbicacionEntity } from '../../domain/entities/ubicacion.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeUbicacion(
  id: string,
  padreId: string | null = null,
  activo = true,
  deletedAt: Date | null = null,
): UbicacionEntity {
  return UbicacionEntity.reconstitute(
    { nombre: `Ubicacion ${id}`, descripcion: null, padreId, activo },
    id,
    new Date(),
    new Date(),
    deletedAt,
  );
}

// ─── Constantes de test ───────────────────────────────────────────────────────

const PADRE_ID = 'ub-padre-001';

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('CrearUbicacionUseCase', () => {
  let useCase: CrearUbicacionUseCase;

  const mockUbicacionRepo = {
    findById: vi.fn(),
    findAllActive: vi.fn(),
    findSubtree: vi.fn(),
    save: vi.fn<Promise<void>, [UbicacionEntity]>(),
    delete: vi.fn(),
  } satisfies vi.Mocked<IUbicacionRepository>;

  const mockTxRunner: ITenantTransactionRunner = {
    run: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockUbicacionRepo.save.mockResolvedValue(undefined);
    (mockTxRunner.run as vi.Mock).mockImplementation((fn: () => Promise<unknown>) => fn());

    useCase = new CrearUbicacionUseCase(mockUbicacionRepo, mockTxRunner);
  });

  // ─── validación de padre_id ───────────────────────────────────────────────

  describe('validación de padre_id', () => {
    const crearDto: CrearUbicacionDto = {
      nombre: 'Sala de servidores',
      descripcion: null,
      padreId: PADRE_ID,
    };

    it('retorna fallo cuando el padre_id no existe', async () => {
      mockUbicacionRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute(crearDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('PADRE_UBICACION_ELIMINADO');
    });

    it('retorna fallo cuando el padre fue soft-deleted', async () => {
      mockUbicacionRepo.findById.mockResolvedValue(makeUbicacion(PADRE_ID, null, true, new Date()));

      const result = await useCase.execute(crearDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('PADRE_UBICACION_ELIMINADO');
    });

    it('retorna ok cuando no hay padre_id (nodo raiz)', async () => {
      const result = await useCase.execute({ nombre: 'Edificio Central', descripcion: null });

      expect(result.isOk()).toBe(true);
    });

    it('retorna ok cuando el padre existe y no está eliminado', async () => {
      mockUbicacionRepo.findById.mockResolvedValue(makeUbicacion(PADRE_ID));

      const result = await useCase.execute(crearDto);

      expect(result.isOk()).toBe(true);
    });

    it('no persiste nada cuando el padre está eliminado', async () => {
      mockUbicacionRepo.findById.mockResolvedValue(makeUbicacion(PADRE_ID, null, true, new Date()));

      await useCase.execute(crearDto);

      expect(mockUbicacionRepo.save).not.toHaveBeenCalled();
    });

    it('la ubicacion creada tiene activo=true por defecto', async () => {
      let saved: UbicacionEntity | undefined;
      mockUbicacionRepo.save.mockImplementation(async (u) => {
        saved = u;
      });

      await useCase.execute({ nombre: 'Sala nueva', descripcion: null });

      expect(saved!.activo).toBe(true);
    });

    it('la ubicacion creada tiene el nombre del DTO', async () => {
      let saved: UbicacionEntity | undefined;
      mockUbicacionRepo.save.mockImplementation(async (u) => {
        saved = u;
      });

      await useCase.execute({ nombre: 'Sala nueva', descripcion: null });

      expect(saved!.nombre).toBe('Sala nueva');
    });
  });

  // ─── happy path ───────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('retorna Result.ok con la ubicacion creada', async () => {
      const result = await useCase.execute({ nombre: 'Piso 1', descripcion: null });

      expect(result.isOk()).toBe(true);
    });

    it('la ubicacion creada tiene UUIDv7', async () => {
      const result = await useCase.execute({ nombre: 'Piso 1', descripcion: null });

      const uuidV7Pattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(result.getValue().id).toMatch(uuidV7Pattern);
    });
  });
});
