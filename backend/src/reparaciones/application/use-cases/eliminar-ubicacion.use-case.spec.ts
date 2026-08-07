/**
 * T8.4 [UNIT][RED] — `EliminarUbicacionUseCase`.
 *
 * Soft delete en cascada del subárbol (findSubtree) dentro de UNA
 * transacción.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E2. Tarea: T8.4.
 */
import { UbicacionEntity } from '../../domain/entities/ubicacion.entity';
import { EliminarUbicacionUseCase } from './eliminar-ubicacion.use-case';
import { UbicacionNoEncontradaError } from '../../domain/errors/reparaciones.errors';

describe('EliminarUbicacionUseCase', () => {
  function buildDeps() {
    const ubicacionRepo = { findById: vi.fn(), findSubtree: vi.fn(), delete: vi.fn() };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };
    const useCase = new EliminarUbicacionUseCase(ubicacionRepo as any, txRunner as any);
    return { useCase, ubicacionRepo, txRunner };
  }

  it('elimina en cascada la raíz + todos los descendientes del subárbol', async () => {
    const { useCase, ubicacionRepo, txRunner } = buildDeps();
    const raiz = UbicacionEntity.create({ nombre: 'Raiz' }, 'raiz-uuid');
    const hijo = UbicacionEntity.create({ nombre: 'Hijo', padreId: 'raiz-uuid' }, 'hijo-uuid');
    const nieto = UbicacionEntity.create({ nombre: 'Nieto', padreId: 'hijo-uuid' }, 'nieto-uuid');
    ubicacionRepo.findById.mockResolvedValue(raiz);
    ubicacionRepo.findSubtree.mockResolvedValue([raiz, hijo, nieto]);

    const result = await useCase.execute({ ubicacionId: 'raiz-uuid' });

    expect(result.isOk()).toBe(true);
    expect(txRunner.run).toHaveBeenCalledTimes(1);
    expect(ubicacionRepo.delete).toHaveBeenCalledWith('raiz-uuid');
    expect(ubicacionRepo.delete).toHaveBeenCalledWith('hijo-uuid');
    expect(ubicacionRepo.delete).toHaveBeenCalledWith('nieto-uuid');
    expect(ubicacionRepo.delete).toHaveBeenCalledTimes(3);
  });

  it('falla con UbicacionNoEncontradaError si la ubicación raíz no existe', async () => {
    const { useCase, ubicacionRepo } = buildDeps();
    ubicacionRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute({ ubicacionId: 'inexistente' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(UbicacionNoEncontradaError);
    expect(ubicacionRepo.findSubtree).not.toHaveBeenCalled();
  });

  it('falla con UbicacionNoEncontradaError si la ubicación raíz ya fue eliminada', async () => {
    const { useCase, ubicacionRepo } = buildDeps();
    const eliminada = UbicacionEntity.create({ nombre: 'Raiz' }, 'raiz-uuid');
    eliminada.softDelete();
    ubicacionRepo.findById.mockResolvedValue(eliminada);

    const result = await useCase.execute({ ubicacionId: 'raiz-uuid' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(UbicacionNoEncontradaError);
  });
});
