/**
 * T2.4 [RED] — EditarCicloVigenteUseCase (RED → GREEN)
 *
 * Cubre (ADR-2 — editar NO propaga a ciclos_cliente):
 * - id no existe → Result.fail(CicloVigenteNotFoundError).
 * - solo nombre presente → aplica rename, save() llamado, no toca fechas.
 * - fechaInicio/fechaFin válidas + ciclo activo=true → revalida overlap
 *   EXCLUYENDO el propio id → Result.ok, save() llamado.
 * - fechaFin <= fechaInicio → Result.fail(CicloVigenteInvalidDatesError), no llama save.
 * - fechas nuevas solapan con OTRO ciclo activo (excluyendo el propio id) → Result.fail(CicloVigenteOverlapError).
 * - si el ciclo editado quedará activo=false, NO revalida solapamiento.
 * - activo: true/false presente → aplica activate()/deactivate().
 * - arquitectura: el use case solo recibe ICicloVigenteRepository (no conoce ciclos_cliente).
 */
import { EditarCicloVigenteUseCase } from './editar-ciclo-vigente.use-case';
import { ICicloVigenteRepository } from '../../domain/ports/i-ciclo-vigente.repository';
import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';
import {
  CicloVigenteNotFoundError,
  CicloVigenteInvalidDatesError,
  CicloVigenteOverlapError,
} from '../../domain/errors/clientes.errors';

const makeMockRepo = (): vi.Mocked<ICicloVigenteRepository> => ({
  findById: vi.fn(),
  findAllNonDeleted: vi.fn(),
  findActiveNonDeleted: vi.fn(),
  findAll: vi.fn(),
  save: vi.fn(),
  delete: vi.fn(),
});

const makeCiclo = (
  overrides: Partial<{
    nombre: string;
    fechaInicio: string;
    fechaFin: string;
    activo: boolean;
  }> = {},
  id?: string,
): CicloVigenteEntity =>
  CicloVigenteEntity.create(
    {
      nombre: overrides.nombre ?? 'Ejercicio 2026',
      fechaInicio: new Date(overrides.fechaInicio ?? '2026-01-01'),
      fechaFin: new Date(overrides.fechaFin ?? '2026-12-31'),
      activo: overrides.activo ?? true,
    },
    id,
  );

describe('EditarCicloVigenteUseCase', () => {
  let useCase: EditarCicloVigenteUseCase;
  let repo: vi.Mocked<ICicloVigenteRepository>;

  beforeEach(() => {
    repo = makeMockRepo();
    useCase = new EditarCicloVigenteUseCase(repo);
  });

  it('id no existe → Result.fail(CicloVigenteNotFoundError)', async () => {
    repo.findById.mockResolvedValue(null);

    const result = await useCase.execute('no-existe', { nombre: 'X' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CicloVigenteNotFoundError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('solo nombre presente → aplica rename, save() llamado, no toca fechas', async () => {
    const ciclo = makeCiclo();
    const fechaInicioOriginal = ciclo.fechaInicio;
    const fechaFinOriginal = ciclo.fechaFin;
    repo.findById.mockResolvedValue(ciclo);
    repo.save.mockResolvedValue(undefined);

    const result = await useCase.execute(ciclo.id, { nombre: 'Renombrado' });

    expect(result.isOk()).toBe(true);
    expect(ciclo.nombre).toBe('Renombrado');
    expect(ciclo.fechaInicio).toEqual(fechaInicioOriginal);
    expect(ciclo.fechaFin).toEqual(fechaFinOriginal);
    expect(repo.save).toHaveBeenCalledWith(ciclo);
  });

  it('fechas válidas + ciclo activo=true → revalida overlap EXCLUYENDO el propio id → Result.ok', async () => {
    const ciclo = makeCiclo({ activo: true }, 'ciclo-editado');
    repo.findById.mockResolvedValue(ciclo);
    // El propio ciclo aparece en findActiveNonDeleted (activo=true) — debe excluirse de la comparación.
    repo.findActiveNonDeleted.mockResolvedValue([ciclo]);
    repo.save.mockResolvedValue(undefined);

    const result = await useCase.execute(ciclo.id, {
      fechaInicio: '2027-01-01',
      fechaFin: '2027-12-31',
    });

    expect(result.isOk()).toBe(true);
    expect(ciclo.fechaInicio).toEqual(new Date('2027-01-01'));
    expect(ciclo.fechaFin).toEqual(new Date('2027-12-31'));
    expect(repo.save).toHaveBeenCalledWith(ciclo);
  });

  it('fechaFin <= fechaInicio → Result.fail(CicloVigenteInvalidDatesError), no llama save', async () => {
    const ciclo = makeCiclo();
    repo.findById.mockResolvedValue(ciclo);

    const result = await useCase.execute(ciclo.id, {
      fechaInicio: '2027-06-01',
      fechaFin: '2027-01-01',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CicloVigenteInvalidDatesError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('fechas nuevas SOLAPAN con otro ciclo activo (excluyendo el propio id) → Result.fail(CicloVigenteOverlapError)', async () => {
    const ciclo = makeCiclo({ activo: true }, 'ciclo-editado');
    const otro = makeCiclo(
      { fechaInicio: '2027-01-01', fechaFin: '2027-12-31', activo: true },
      'otro-ciclo',
    );
    repo.findById.mockResolvedValue(ciclo);
    repo.findActiveNonDeleted.mockResolvedValue([ciclo, otro]);

    const result = await useCase.execute(ciclo.id, {
      fechaInicio: '2027-03-01',
      fechaFin: '2027-06-30',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CicloVigenteOverlapError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('si el ciclo editado quedará activo=false, NO revalida solapamiento', async () => {
    const ciclo = makeCiclo({ activo: true }, 'ciclo-editado');
    const otro = makeCiclo(
      { fechaInicio: '2027-01-01', fechaFin: '2027-12-31', activo: true },
      'otro-ciclo',
    );
    repo.findById.mockResolvedValue(ciclo);
    repo.findActiveNonDeleted.mockResolvedValue([otro]);
    repo.save.mockResolvedValue(undefined);

    // fechas se solapan con "otro", pero activo:false → no debe bloquear.
    const result = await useCase.execute(ciclo.id, {
      fechaInicio: '2027-03-01',
      fechaFin: '2027-06-30',
      activo: false,
    });

    expect(result.isOk()).toBe(true);
    expect(repo.findActiveNonDeleted).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledWith(ciclo);
  });

  it('activo: true presente → aplica activate()', async () => {
    const ciclo = makeCiclo({ activo: false });
    repo.findById.mockResolvedValue(ciclo);
    repo.save.mockResolvedValue(undefined);

    const result = await useCase.execute(ciclo.id, { activo: true });

    expect(result.isOk()).toBe(true);
    expect(ciclo.activo).toBe(true);
  });

  it('activo: false presente → aplica deactivate()', async () => {
    const ciclo = makeCiclo({ activo: true });
    repo.findById.mockResolvedValue(ciclo);
    repo.save.mockResolvedValue(undefined);

    const result = await useCase.execute(ciclo.id, { activo: false });

    expect(result.isOk()).toBe(true);
    expect(ciclo.activo).toBe(false);
  });

  it('arquitectura: el constructor solo recibe ICicloVigenteRepository (no conoce ciclos_cliente)', () => {
    expect(EditarCicloVigenteUseCase.length).toBe(1); // un solo parámetro de constructor
  });
});
