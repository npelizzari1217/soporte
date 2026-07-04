/**
 * T2.3 [RED] — ListarCiclosVigentesUseCase (RED → GREEN)
 *
 * Cubre:
 * - execute() delega en findAllNonDeleted() y retorna el array tal cual.
 * - retorna [] si el repo retorna [].
 * - incluye ciclos con activo=false (no filtra client-side).
 */
import { ListarCiclosVigentesUseCase } from './listar-ciclos-vigentes.use-case';
import { ICicloVigenteRepository } from '../../domain/ports/i-ciclo-vigente.repository';
import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';

const makeMockRepo = (): vi.Mocked<ICicloVigenteRepository> => ({
  findById: vi.fn(),
  findAllNonDeleted: vi.fn(),
  findActiveNonDeleted: vi.fn(),
  findAll: vi.fn(),
  save: vi.fn(),
  delete: vi.fn(),
});

const makeCiclo = (nombre: string, activo: boolean): CicloVigenteEntity =>
  CicloVigenteEntity.create({
    nombre,
    fechaInicio: new Date('2026-01-01'),
    fechaFin: new Date('2026-12-31'),
    activo,
  });

describe('ListarCiclosVigentesUseCase', () => {
  let useCase: ListarCiclosVigentesUseCase;
  let repo: vi.Mocked<ICicloVigenteRepository>;

  beforeEach(() => {
    repo = makeMockRepo();
    useCase = new ListarCiclosVigentesUseCase(repo);
  });

  it('delega en findAllNonDeleted() y retorna el array tal cual', async () => {
    const ciclos = [makeCiclo('A', true), makeCiclo('B', false)];
    repo.findAllNonDeleted.mockResolvedValue(ciclos);

    const result = await useCase.execute();

    expect(repo.findAllNonDeleted).toHaveBeenCalledTimes(1);
    expect(result).toBe(ciclos);
  });

  it('retorna [] si el repo retorna []', async () => {
    repo.findAllNonDeleted.mockResolvedValue([]);
    const result = await useCase.execute();
    expect(result).toEqual([]);
  });

  it('incluye ciclos con activo=false (no filtra client-side)', async () => {
    const inactivo = makeCiclo('Inactivo', false);
    repo.findAllNonDeleted.mockResolvedValue([inactivo]);

    const result = await useCase.execute();

    expect(result).toContain(inactivo);
  });
});
