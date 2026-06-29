/**
 * Unit tests para ObtenerComponentesPorEquipoUseCase.
 *
 * Verifica:
 * - Verifica existencia del equipo antes de listar componentes.
 * - Retorna EquipoInformaticoNoEncontradoError si el equipo no existe o está soft-deleted.
 * - Retorna Result.ok([]) si el equipo existe pero no tiene componentes.
 * - Retorna Result.ok([c1, c2]) con la lista de componentes no soft-deleted.
 *
 * Patrón: clona ListarOperacionesUseCase (tickets-core) — guard de parent + lista hijos.
 * Tarea: 6.B-lectura / ObtenerComponentesPorEquipoUseCase
 */
import { ObtenerComponentesPorEquipoUseCase } from './obtener-componentes-por-equipo.use-case';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EQUIPO_ID = 'eq000000-0000-4000-e000-000000000077';
const TIPO_ID = 'tc000000-0000-4000-t000-000000000001';

function makeEquipo(deletedAt: Date | null = null): EquipoInformaticoEntity {
  return EquipoInformaticoEntity.reconstitute(
    {
      nombre: 'PC Contabilidad',
      numeroSerie: null,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacionId: null,
      asignadoAId: null,
      activo: true,
    },
    EQUIPO_ID,
    new Date(),
    new Date(),
    deletedAt,
  );
}

function makeComponente(id: string): ComponenteEquipoEntity {
  return ComponenteEquipoEntity.reconstitute(
    {
      equipoId: EQUIPO_ID,
      tipoComponenteId: TIPO_ID,
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    },
    id,
    new Date(),
    new Date(),
    null,
  );
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('ObtenerComponentesPorEquipoUseCase', () => {
  let useCase: ObtenerComponentesPorEquipoUseCase;

  const mockEquipoRepo = {
    findById: vi.fn<Promise<EquipoInformaticoEntity | null>, [string]>(),
    findByNumeroSerie: vi.fn(),
    findAllActive: vi.fn(),
    findByAsignadoAId: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  } satisfies vi.Mocked<IEquipoInformaticoRepository>;

  const mockComponenteRepo = {
    findById: vi.fn(),
    findByEquipoId: vi.fn<Promise<ComponenteEquipoEntity[]>, [string]>(),
    save: vi.fn(),
    delete: vi.fn(),
  } satisfies vi.Mocked<IComponenteEquipoRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new ObtenerComponentesPorEquipoUseCase(mockEquipoRepo, mockComponenteRepo);
  });

  // ─── Guard: equipo no existe ──────────────────────────────────────────────

  it('retorna EquipoInformaticoNoEncontradoError cuando el equipo no existe', async () => {
    mockEquipoRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute(EQUIPO_ID);

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('EQUIPO_INFORMATICO_NO_ENCONTRADO');
    expect(mockComponenteRepo.findByEquipoId).not.toHaveBeenCalled();
  });

  it('retorna EquipoInformaticoNoEncontradoError cuando el equipo está soft-deleted', async () => {
    mockEquipoRepo.findById.mockResolvedValue(makeEquipo(new Date()));

    const result = await useCase.execute(EQUIPO_ID);

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('EQUIPO_INFORMATICO_NO_ENCONTRADO');
    expect(mockComponenteRepo.findByEquipoId).not.toHaveBeenCalled();
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  it('retorna Result.ok([]) cuando el equipo existe pero no tiene componentes', async () => {
    mockEquipoRepo.findById.mockResolvedValue(makeEquipo());
    mockComponenteRepo.findByEquipoId.mockResolvedValue([]);

    const result = await useCase.execute(EQUIPO_ID);

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([]);
  });

  it('retorna Result.ok con los componentes del equipo', async () => {
    const componentes = [makeComponente('comp-001'), makeComponente('comp-002')];
    mockEquipoRepo.findById.mockResolvedValue(makeEquipo());
    mockComponenteRepo.findByEquipoId.mockResolvedValue(componentes);

    const result = await useCase.execute(EQUIPO_ID);

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toHaveLength(2);
    expect(result.getValue()[0].id).toBe('comp-001');
  });

  it('pasa el equipoId correcto a findByEquipoId', async () => {
    mockEquipoRepo.findById.mockResolvedValue(makeEquipo());
    mockComponenteRepo.findByEquipoId.mockResolvedValue([]);

    await useCase.execute(EQUIPO_ID);

    expect(mockComponenteRepo.findByEquipoId).toHaveBeenCalledWith(EQUIPO_ID);
  });
});
