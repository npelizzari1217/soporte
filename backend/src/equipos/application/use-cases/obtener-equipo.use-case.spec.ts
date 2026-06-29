/**
 * Unit tests para ObtenerEquipoUseCase.
 *
 * Verifica:
 * - Delega a IEquipoInformaticoRepository.findById.
 * - Retorna Result.ok(equipo) cuando existe y no está borrado.
 * - Retorna Result.fail(EquipoInformaticoNoEncontradoError) cuando no existe.
 * - Retorna Result.fail(EquipoInformaticoNoEncontradoError) cuando está soft-deleted.
 *
 * Patrón: clona ObtenerTicketUseCase (tickets-core, tarea 3.E.2).
 * Tarea: 6.B-lectura / ObtenerEquipoUseCase
 */
import { ObtenerEquipoUseCase } from './obtener-equipo.use-case';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EQUIPO_ID = 'eq000000-0000-4000-e000-000000000099';

function makeEquipo(deletedAt: Date | null = null): EquipoInformaticoEntity {
  return EquipoInformaticoEntity.reconstitute(
    {
      nombre: 'PC Test',
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

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('ObtenerEquipoUseCase', () => {
  let useCase: ObtenerEquipoUseCase;

  const mockEquipoRepo = {
    findById: vi.fn<Promise<EquipoInformaticoEntity | null>, [string]>(),
    findByNumeroSerie: vi.fn(),
    findAllActive: vi.fn(),
    findByAsignadoAId: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  } satisfies vi.Mocked<IEquipoInformaticoRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new ObtenerEquipoUseCase(mockEquipoRepo);
  });

  it('retorna Result.ok con el equipo cuando existe y no está borrado', async () => {
    mockEquipoRepo.findById.mockResolvedValue(makeEquipo());

    const result = await useCase.execute(EQUIPO_ID);

    expect(result.isOk()).toBe(true);
    expect(result.getValue().id).toBe(EQUIPO_ID);
    expect(mockEquipoRepo.findById).toHaveBeenCalledWith(EQUIPO_ID);
  });

  it('retorna EquipoInformaticoNoEncontradoError cuando el equipo no existe', async () => {
    mockEquipoRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute(EQUIPO_ID);

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('EQUIPO_INFORMATICO_NO_ENCONTRADO');
  });

  it('retorna EquipoInformaticoNoEncontradoError cuando el equipo está soft-deleted', async () => {
    mockEquipoRepo.findById.mockResolvedValue(makeEquipo(new Date()));

    const result = await useCase.execute(EQUIPO_ID);

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('EQUIPO_INFORMATICO_NO_ENCONTRADO');
  });
});
