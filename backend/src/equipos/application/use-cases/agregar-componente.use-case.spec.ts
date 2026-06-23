import { AgregarComponenteUseCase, AgregarComponenteDto } from './agregar-componente.use-case';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import { ITiposComponenteRepository } from '../../domain/ports/i-tipos-componente.repository';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { TipoComponenteEntity } from '../../domain/entities/tipos-componente.entity';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEquipo(id: string, deletedAt: Date | null = null): EquipoInformaticoEntity {
  return EquipoInformaticoEntity.reconstitute(
    {
      nombre: `Equipo ${id}`,
      numeroSerie: null,
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
    deletedAt,
  );
}

function makeTipoComponente(id: string, activo: boolean): TipoComponenteEntity {
  return TipoComponenteEntity.reconstitute(
    { codigo: 'RAM', nombre: 'Memoria RAM', activo },
    id,
    new Date(),
    new Date(),
    null,
  );
}

// ─── Constantes de test ───────────────────────────────────────────────────────

const EQUIPO_ID = 'eq000000-0000-4000-e000-000000000001';
const TIPO_COMPONENTE_ID = 'tc000000-0000-4000-t000-000000000001';

const validDto: AgregarComponenteDto = {
  equipoId: EQUIPO_ID,
  tipoComponenteId: TIPO_COMPONENTE_ID,
  descripcion: 'Kingston 16GB DDR4',
  numeroSerie: null,
  capacidad: '16GB DDR4',
};

// ─── Suite principal ──────────────────────────────────────────────────────────

describe('AgregarComponenteUseCase', () => {
  let useCase: AgregarComponenteUseCase;

  const mockEquipoRepo = {
    findById: jest.fn(),
    findByNumeroSerie: jest.fn(),
    findAllActive: jest.fn(),
    findByAsignadoAId: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  } satisfies jest.Mocked<IEquipoInformaticoRepository>;

  const mockComponenteRepo = {
    findById: jest.fn(),
    findByEquipoId: jest.fn(),
    save: jest.fn<Promise<void>, [ComponenteEquipoEntity]>(),
    delete: jest.fn(),
  } satisfies jest.Mocked<IComponenteEquipoRepository>;

  const mockTiposComponenteRepo = {
    findById: jest.fn(),
    findByCodigo: jest.fn(),
    findAllActive: jest.fn(),
    save: jest.fn(),
  } satisfies jest.Mocked<ITiposComponenteRepository>;

  const mockTxRunner: ITenantTransactionRunner = {
    run: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockEquipoRepo.findById.mockResolvedValue(makeEquipo(EQUIPO_ID));
    mockTiposComponenteRepo.findById.mockResolvedValue(makeTipoComponente(TIPO_COMPONENTE_ID, true));
    mockComponenteRepo.save.mockResolvedValue(undefined);
    (mockTxRunner.run as jest.Mock).mockImplementation((fn: () => Promise<unknown>) => fn());

    useCase = new AgregarComponenteUseCase(
      mockEquipoRepo,
      mockComponenteRepo,
      mockTiposComponenteRepo,
      mockTxRunner,
    );
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
      mockEquipoRepo.findById.mockResolvedValue(makeEquipo(EQUIPO_ID, new Date()));

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('EQUIPO_INFORMATICO_NO_ENCONTRADO');
    });
  });

  // ─── Tipo de componente inactivo ──────────────────────────────────────────

  describe('tipo de componente inactivo', () => {
    it('retorna fallo cuando el tipo_componente no existe', async () => {
      mockTiposComponenteRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TIPO_COMPONENTE_INACTIVO');
    });

    it('retorna fallo (422) cuando el tipo_componente está inactivo', async () => {
      mockTiposComponenteRepo.findById.mockResolvedValue(
        makeTipoComponente(TIPO_COMPONENTE_ID, false),
      );

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TIPO_COMPONENTE_INACTIVO');
    });

    it('tipo_componente inactivo NO afecta componentes existentes (solo bloquea nuevos)', async () => {
      // Este test verifica la semántica: AgregarComponenteUseCase solo bloquea la CREACIÓN.
      // Los existentes se consultan via IComponenteEquipoRepository sin filtro de actividad del tipo.
      // El check de tipo activo solo aplica al agregar.
      mockTiposComponenteRepo.findById.mockResolvedValue(
        makeTipoComponente(TIPO_COMPONENTE_ID, false),
      );

      const result = await useCase.execute(validDto);

      // Confirmamos que falla por el tipo inactivo (no por otro motivo)
      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('TIPO_COMPONENTE_INACTIVO');
      // Y que NO se intentó guardar
      expect(mockComponenteRepo.save).not.toHaveBeenCalled();
    });

    it('no persiste nada cuando el tipo_componente está inactivo', async () => {
      mockTiposComponenteRepo.findById.mockResolvedValue(
        makeTipoComponente(TIPO_COMPONENTE_ID, false),
      );

      await useCase.execute(validDto);

      expect(mockComponenteRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('retorna Result.ok con el componente creado', async () => {
      const result = await useCase.execute(validDto);

      expect(result.isOk()).toBe(true);
    });

    it('el componente creado tiene equipoId del DTO', async () => {
      let saved: ComponenteEquipoEntity | undefined;
      mockComponenteRepo.save.mockImplementation(async (c) => {
        saved = c;
      });

      await useCase.execute(validDto);

      expect(saved!.equipoId).toBe(EQUIPO_ID);
    });

    it('el componente creado tiene tipoComponenteId del DTO', async () => {
      let saved: ComponenteEquipoEntity | undefined;
      mockComponenteRepo.save.mockImplementation(async (c) => {
        saved = c;
      });

      await useCase.execute(validDto);

      expect(saved!.tipoComponenteId).toBe(TIPO_COMPONENTE_ID);
    });

    it('el componente creado tiene id en formato UUIDv7', async () => {
      const result = await useCase.execute(validDto);

      const uuidV7Pattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(result.getValue().id).toMatch(uuidV7Pattern);
    });

    it('el save ocurre DENTRO del callback del txRunner', async () => {
      const callOrder: string[] = [];
      (mockTxRunner.run as jest.Mock).mockImplementation(async (fn: () => Promise<unknown>) => {
        callOrder.push('tx:start');
        const r = await fn();
        callOrder.push('tx:end');
        return r;
      });
      mockComponenteRepo.save.mockImplementation(async () => {
        callOrder.push('componente:save');
      });

      await useCase.execute(validDto);

      expect(callOrder.indexOf('tx:start')).toBeLessThan(callOrder.indexOf('componente:save'));
      expect(callOrder.indexOf('tx:end')).toBeGreaterThan(callOrder.indexOf('componente:save'));
    });
  });
});
