/**
 * T8.3 [UNIT][RED→GREEN] — `CrearUbicacionUseCase`.
 *
 * padreId debe existir (y no estar eliminado) si se provee.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E2. Tarea: T8.3.
 */
import { UbicacionEntity } from '../../domain/entities/ubicacion.entity';
import { CrearUbicacionUseCase } from './crear-ubicacion.use-case';
import { UbicacionInvalidaError } from '../../domain/errors/reparaciones.errors';

describe('CrearUbicacionUseCase', () => {
  function buildDeps() {
    const ubicacionRepo = { findById: vi.fn(), save: vi.fn() };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };
    const useCase = new CrearUbicacionUseCase(ubicacionRepo as any, txRunner as any);
    return { useCase, ubicacionRepo };
  }

  it('crea una ubicación raíz (sin padreId)', async () => {
    const { useCase, ubicacionRepo } = buildDeps();

    const result = await useCase.execute({ nombre: 'Edificio Central' });

    expect(result.isOk()).toBe(true);
    const ubicacion = result.getValue();
    expect(ubicacion.nombre).toBe('Edificio Central');
    expect(ubicacion.padreId).toBeNull();
    expect(ubicacion.activo).toBe(true);
    expect(ubicacionRepo.save).toHaveBeenCalledWith(ubicacion);
  });

  it('crea una ubicación hija cuando el padreId existe y está activo', async () => {
    const { useCase, ubicacionRepo } = buildDeps();
    const padre = UbicacionEntity.create({ nombre: 'Edificio Central' }, 'padre-uuid');
    ubicacionRepo.findById.mockResolvedValue(padre);

    const result = await useCase.execute({ nombre: 'Piso 3', padreId: 'padre-uuid' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().padreId).toBe('padre-uuid');
  });

  it('falla con UbicacionInvalidaError si el padreId no existe', async () => {
    const { useCase, ubicacionRepo } = buildDeps();
    ubicacionRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute({ nombre: 'Piso 3', padreId: 'padre-inexistente' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(UbicacionInvalidaError);
  });

  it('falla con UbicacionInvalidaError si el padreId fue eliminado (soft delete)', async () => {
    const { useCase, ubicacionRepo } = buildDeps();
    const padre = UbicacionEntity.create({ nombre: 'Edificio Central' }, 'padre-uuid');
    padre.softDelete();
    ubicacionRepo.findById.mockResolvedValue(padre);

    const result = await useCase.execute({ nombre: 'Piso 3', padreId: 'padre-uuid' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(UbicacionInvalidaError);
  });
});
