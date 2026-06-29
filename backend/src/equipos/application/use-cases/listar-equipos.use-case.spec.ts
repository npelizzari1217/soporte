/**
 * Unit tests para ListarEquiposUseCase.
 *
 * Verifica:
 * - Delega a IEquipoInformaticoRepository.findAllActive.
 * - Retorna Result.ok([]) cuando no hay equipos.
 * - Retorna Result.ok([equipo1, equipo2]) con la lista completa.
 * - Solo retorna equipos no soft-deleted (la responsabilidad de filtrar es del repo).
 *
 * Patrón: sigue el estilo de ListarOperacionesUseCase (tickets-core) adaptado
 * para listar sin ticket-parent (los equipos se listan directamente del tenant).
 * Tarea: 6.B-lectura / ListarEquiposUseCase
 */
import { ListarEquiposUseCase } from './listar-equipos.use-case';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEquipo(id: string, activo = true): EquipoInformaticoEntity {
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
    null,
  );
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('ListarEquiposUseCase', () => {
  let useCase: ListarEquiposUseCase;

  const mockEquipoRepo = {
    findById: vi.fn(),
    findByNumeroSerie: vi.fn(),
    findAllActive: vi.fn<Promise<EquipoInformaticoEntity[]>, []>(),
    findByAsignadoAId: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  } satisfies vi.Mocked<IEquipoInformaticoRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new ListarEquiposUseCase(mockEquipoRepo);
  });

  it('retorna Result.ok([]) cuando no hay equipos activos en el tenant', async () => {
    mockEquipoRepo.findAllActive.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([]);
    expect(mockEquipoRepo.findAllActive).toHaveBeenCalledTimes(1);
  });

  it('retorna Result.ok con la lista de equipos activos', async () => {
    const equipos = [makeEquipo('eq-001'), makeEquipo('eq-002')];
    mockEquipoRepo.findAllActive.mockResolvedValue(equipos);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toHaveLength(2);
    expect(result.getValue()[0].id).toBe('eq-001');
    expect(result.getValue()[1].id).toBe('eq-002');
  });

  it('delega al repositorio con findAllActive (filtro activo+no-deleted es del repo)', async () => {
    mockEquipoRepo.findAllActive.mockResolvedValue([makeEquipo('eq-001')]);

    await useCase.execute();

    expect(mockEquipoRepo.findAllActive).toHaveBeenCalledTimes(1);
    // No se llaman otros métodos de búsqueda
    expect(mockEquipoRepo.findById).not.toHaveBeenCalled();
  });
});
