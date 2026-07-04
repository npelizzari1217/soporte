/**
 * T2.5 [RED] — DesactivarCicloVigenteUseCase (RED → GREEN)
 *
 * Cubre (ADR-1 — soft-delete obligatorio, NUNCA baja física):
 * - id no existe → Result.fail(CicloVigenteNotFoundError), save() NO llamado.
 * - id existe → softDelete() + save() llamado → Result.ok(undefined).
 * - el use case JAMÁS llama a repo.delete() (guardia explícita anti baja física).
 */
import { DesactivarCicloVigenteUseCase } from './desactivar-ciclo-vigente.use-case';
import { ICicloVigenteRepository } from '../../domain/ports/i-ciclo-vigente.repository';
import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';
import { CicloVigenteNotFoundError } from '../../domain/errors/clientes.errors';

const makeMockRepo = (): vi.Mocked<ICicloVigenteRepository> => ({
  findById: vi.fn(),
  findAllNonDeleted: vi.fn(),
  findActiveNonDeleted: vi.fn(),
  findAll: vi.fn(),
  save: vi.fn(),
  delete: vi.fn(),
});

const makeCiclo = (): CicloVigenteEntity =>
  CicloVigenteEntity.create({
    nombre: 'Ejercicio 2026',
    fechaInicio: new Date('2026-01-01'),
    fechaFin: new Date('2026-12-31'),
    activo: true,
  });

describe('DesactivarCicloVigenteUseCase', () => {
  let useCase: DesactivarCicloVigenteUseCase;
  let repo: vi.Mocked<ICicloVigenteRepository>;

  beforeEach(() => {
    repo = makeMockRepo();
    useCase = new DesactivarCicloVigenteUseCase(repo);
  });

  it('id no existe → Result.fail(CicloVigenteNotFoundError), save() NO llamado', async () => {
    repo.findById.mockResolvedValue(null);

    const result = await useCase.execute('no-existe');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CicloVigenteNotFoundError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('id existe → softDelete() + save() llamado → Result.ok(undefined)', async () => {
    const ciclo = makeCiclo();
    repo.findById.mockResolvedValue(ciclo);
    repo.save.mockResolvedValue(undefined);

    const result = await useCase.execute(ciclo.id);

    expect(result.isOk()).toBe(true);
    expect(ciclo.isDeleted()).toBe(true);
    expect(ciclo.deletedAt).not.toBeNull();
    expect(repo.save).toHaveBeenCalledWith(ciclo);
  });

  it('JAMÁS llama a repo.delete() (guardia explícita anti baja física — ADR-1)', async () => {
    const ciclo = makeCiclo();
    repo.findById.mockResolvedValue(ciclo);
    repo.save.mockResolvedValue(undefined);

    await useCase.execute(ciclo.id);

    expect(repo.delete).not.toHaveBeenCalled();
  });
});
