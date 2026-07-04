/**
 * T3.7 [RED] — Unit tests de ObtenerCicloActivoUseCase.
 *
 * Lectura del activo (ADR-8): delega en ICicloClienteRepository.findActive().
 */
import { ObtenerCicloActivoUseCase } from './obtener-ciclo-activo.use-case';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';

function makeMockRepo(): vi.Mocked<ICicloClienteRepository> {
  return {
    findAll: vi.fn(),
    findById: vi.fn(),
    save: vi.fn(),
    activarCiclo: vi.fn(),
    findActive: vi.fn(),
  };
}

describe('ObtenerCicloActivoUseCase (T3.7)', () => {
  let useCase: ObtenerCicloActivoUseCase;
  let repo: vi.Mocked<ICicloClienteRepository>;

  beforeEach(() => {
    repo = makeMockRepo();
    useCase = new ObtenerCicloActivoUseCase(repo);
  });

  it('hay ciclo activo → retorna la entidad (delega en findActive)', async () => {
    const activo = CicloClienteEntity.create({
      nombre: 'Ejercicio 2026',
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2026-12-31'),
      activo: true,
      cicloVigenteId: 'master-id',
    });
    repo.findActive.mockResolvedValue(activo);

    const result = await useCase.execute();

    expect(result).toBe(activo);
    expect(repo.findActive).toHaveBeenCalledOnce();
  });

  it('no hay ciclo activo → retorna null (no lanza)', async () => {
    repo.findActive.mockResolvedValue(null);

    const result = await useCase.execute();

    expect(result).toBeNull();
  });
});
