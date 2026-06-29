import { CrearEquipoUseCase, CrearEquipoDto } from './crear-equipo.use-case';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEquipo(id: string, numeroSerie: string | null): EquipoInformaticoEntity {
  return EquipoInformaticoEntity.reconstitute(
    {
      nombre: `Equipo ${id}`,
      numeroSerie,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacionId: null,
      asignadoAId: null,
      activo: true,
    },
    id,
    new Date(),
    new Date(),
    null,
  );
}

// ─── Constantes de test ───────────────────────────────────────────────────────

const NUMERO_SERIE = 'SN-DELL-001';

const validDto: CrearEquipoDto = {
  nombre: 'PC Contabilidad 03',
  numeroSerie: NUMERO_SERIE,
  marca: 'Dell',
  modelo: 'OptiPlex 7090',
  fechaAdquisicion: null,
  ubicacionId: null,
};

// ─── Suite principal ──────────────────────────────────────────────────────────

describe('CrearEquipoUseCase', () => {
  let useCase: CrearEquipoUseCase;

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

    mockEquipoRepo.findByNumeroSerie.mockResolvedValue(null); // no duplicado
    mockEquipoRepo.save.mockResolvedValue(undefined);
    (mockTxRunner.run as vi.Mock).mockImplementation((fn: () => Promise<unknown>) => fn());

    useCase = new CrearEquipoUseCase(mockEquipoRepo, mockTxRunner);
  });

  // ─── Unicidad de número de serie ──────────────────────────────────────────

  describe('validación de unicidad de numero_serie', () => {
    it('retorna fallo (409) cuando ya existe un equipo con el mismo numero_serie', async () => {
      mockEquipoRepo.findByNumeroSerie.mockResolvedValue(makeEquipo('otro-id', NUMERO_SERIE));

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('NUMERO_SERIE_EQUIPO_DUPLICADO');
    });

    it('no persiste nada cuando hay conflicto de numero_serie', async () => {
      mockEquipoRepo.findByNumeroSerie.mockResolvedValue(makeEquipo('otro-id', NUMERO_SERIE));

      await useCase.execute(validDto);

      expect(mockEquipoRepo.save).not.toHaveBeenCalled();
    });

    it('numero_serie = null es válido (UNIQUE parcial — múltiples null permitidos)', async () => {
      const result = await useCase.execute({ ...validDto, numeroSerie: null });

      expect(result.isOk()).toBe(true);
    });

    it('NO llama a findByNumeroSerie cuando numero_serie es null', async () => {
      await useCase.execute({ ...validDto, numeroSerie: null });

      expect(mockEquipoRepo.findByNumeroSerie).not.toHaveBeenCalled();
    });
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('retorna Result.ok con el equipo creado', async () => {
      const result = await useCase.execute(validDto);

      expect(result.isOk()).toBe(true);
    });

    it('el equipo creado tiene activo = true por defecto', async () => {
      let saved: EquipoInformaticoEntity | undefined;
      mockEquipoRepo.save.mockImplementation(async (e) => {
        saved = e;
      });

      await useCase.execute(validDto);

      expect(saved!.activo).toBe(true);
    });

    it('el equipo creado tiene el nombre del DTO', async () => {
      let saved: EquipoInformaticoEntity | undefined;
      mockEquipoRepo.save.mockImplementation(async (e) => {
        saved = e;
      });

      await useCase.execute(validDto);

      expect(saved!.nombre).toBe('PC Contabilidad 03');
    });

    it('el equipo creado tiene id en formato UUIDv7', async () => {
      const result = await useCase.execute(validDto);

      const uuidV7Pattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(result.getValue().id).toMatch(uuidV7Pattern);
    });

    it('el save ocurre DENTRO del callback del txRunner', async () => {
      const callOrder: string[] = [];
      (mockTxRunner.run as vi.Mock).mockImplementation(async (fn: () => Promise<unknown>) => {
        callOrder.push('tx:start');
        const r = await fn();
        callOrder.push('tx:end');
        return r;
      });
      mockEquipoRepo.save.mockImplementation(async () => {
        callOrder.push('equipo:save');
      });

      await useCase.execute(validDto);

      expect(callOrder.indexOf('tx:start')).toBeLessThan(callOrder.indexOf('equipo:save'));
      expect(callOrder.indexOf('tx:end')).toBeGreaterThan(callOrder.indexOf('equipo:save'));
    });
  });
});
