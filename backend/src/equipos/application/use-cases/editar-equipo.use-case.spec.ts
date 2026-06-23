import { EditarEquipoUseCase, EditarEquipoDto } from './editar-equipo.use-case';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEquipo(id: string, numeroSerie: string | null, activo = true): EquipoInformaticoEntity {
  return EquipoInformaticoEntity.reconstitute(
    {
      nombre: `Equipo ${id}`,
      numeroSerie,
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
    null,
  );
}

// ─── Constantes de test ───────────────────────────────────────────────────────

const EQUIPO_ID = 'eq000000-0000-4000-e000-000000000001';
const OTRO_EQUIPO_ID = 'eq000000-0000-4000-e000-000000000002';
const NUMERO_SERIE_ORIGINAL = 'SN-DELL-001';
const NUMERO_SERIE_NUEVO = 'SN-HP-002';

const validDto: EditarEquipoDto = {
  equipoId: EQUIPO_ID,
  nombre: 'PC Contabilidad 03 (actualizada)',
  numeroSerie: NUMERO_SERIE_NUEVO,
  marca: 'HP',
  modelo: 'EliteDesk 800',
  fechaAdquisicion: null,
  ubicacionId: null,
};

// ─── Suite principal ──────────────────────────────────────────────────────────

describe('EditarEquipoUseCase', () => {
  let useCase: EditarEquipoUseCase;

  const mockEquipoRepo = {
    findById: jest.fn(),
    findByNumeroSerie: jest.fn(),
    findAllActive: jest.fn(),
    findByAsignadoAId: jest.fn(),
    save: jest.fn<Promise<void>, [EquipoInformaticoEntity]>(),
    delete: jest.fn(),
  } satisfies jest.Mocked<IEquipoInformaticoRepository>;

  const mockTxRunner: ITenantTransactionRunner = {
    run: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockEquipoRepo.findById.mockResolvedValue(makeEquipo(EQUIPO_ID, NUMERO_SERIE_ORIGINAL));
    mockEquipoRepo.findByNumeroSerie.mockResolvedValue(null); // no duplicado
    mockEquipoRepo.save.mockResolvedValue(undefined);
    (mockTxRunner.run as jest.Mock).mockImplementation((fn: () => Promise<unknown>) => fn());

    useCase = new EditarEquipoUseCase(mockEquipoRepo, mockTxRunner);
  });

  // ─── Equipo no encontrado ─────────────────────────────────────────────────

  describe('equipo no encontrado', () => {
    it('retorna fallo cuando el equipo no existe', async () => {
      mockEquipoRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('EQUIPO_INFORMATICO_NO_ENCONTRADO');
    });

    it('retorna fallo cuando el equipo fue soft-deleted', async () => {
      const equipoEliminado = EquipoInformaticoEntity.reconstitute(
        { nombre: 'X', numeroSerie: null, marca: null, modelo: null, fechaAdquisicion: null, ubicacionId: null, asignadoAId: null, activo: true },
        EQUIPO_ID,
        new Date(),
        new Date(),
        new Date(), // deleted_at seteado
      );
      mockEquipoRepo.findById.mockResolvedValue(equipoEliminado);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('EQUIPO_INFORMATICO_NO_ENCONTRADO');
    });
  });

  // ─── Unicidad de numero_serie ─────────────────────────────────────────────

  describe('validación de unicidad de numero_serie', () => {
    it('retorna fallo (409) cuando otro equipo ya tiene el nuevo numero_serie', async () => {
      mockEquipoRepo.findByNumeroSerie.mockResolvedValue(makeEquipo(OTRO_EQUIPO_ID, NUMERO_SERIE_NUEVO));

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('NUMERO_SERIE_EQUIPO_DUPLICADO');
    });

    it('permite conservar el mismo numero_serie (edit del mismo equipo)', async () => {
      // findByNumeroSerie retorna el MISMO equipo — no hay conflicto real
      mockEquipoRepo.findByNumeroSerie.mockResolvedValue(makeEquipo(EQUIPO_ID, NUMERO_SERIE_ORIGINAL));

      const result = await useCase.execute({ ...validDto, numeroSerie: NUMERO_SERIE_ORIGINAL });

      expect(result.isOk()).toBe(true);
    });

    it('numero_serie = null es válido en edición', async () => {
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
    it('retorna Result.ok con el equipo actualizado', async () => {
      const result = await useCase.execute(validDto);

      expect(result.isOk()).toBe(true);
    });

    it('el save ocurre DENTRO del callback del txRunner', async () => {
      const callOrder: string[] = [];
      (mockTxRunner.run as jest.Mock).mockImplementation(async (fn: () => Promise<unknown>) => {
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
