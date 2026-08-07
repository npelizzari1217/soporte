/**
 * T8.3 [UNIT][RED→GREEN] — `EditarUbicacionUseCase`.
 *
 * Edita nombre/descripcion/padreId (PATCH semántico) + activar/desactivar.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E2. Tarea: T8.3.
 */
import { UbicacionEntity } from '../../domain/entities/ubicacion.entity';
import { EditarUbicacionUseCase } from './editar-ubicacion.use-case';
import {
  UbicacionInvalidaError,
  UbicacionNoEncontradaError,
} from '../../domain/errors/reparaciones.errors';

describe('EditarUbicacionUseCase', () => {
  function buildDeps() {
    const ubicacionRepo = { findById: vi.fn(), save: vi.fn() };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };
    const useCase = new EditarUbicacionUseCase(ubicacionRepo as any, txRunner as any);
    return { useCase, ubicacionRepo };
  }

  it('edita nombre y descripción', async () => {
    const { useCase, ubicacionRepo } = buildDeps();
    const ubicacion = UbicacionEntity.create({ nombre: 'Viejo nombre' }, 'ubicacion-uuid');
    ubicacionRepo.findById.mockResolvedValue(ubicacion);

    const result = await useCase.execute({
      ubicacionId: 'ubicacion-uuid',
      nombre: 'Nuevo nombre',
      descripcion: 'Nueva descripción',
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().nombre).toBe('Nuevo nombre');
    expect(result.getValue().descripcion).toBe('Nueva descripción');
    expect(ubicacionRepo.save).toHaveBeenCalledWith(ubicacion);
  });

  it('desactiva la ubicación cuando activo=false', async () => {
    const { useCase, ubicacionRepo } = buildDeps();
    const ubicacion = UbicacionEntity.create({ nombre: 'Edificio' }, 'ubicacion-uuid');
    ubicacionRepo.findById.mockResolvedValue(ubicacion);

    const result = await useCase.execute({ ubicacionId: 'ubicacion-uuid', activo: false });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().activo).toBe(false);
  });

  it('reactiva la ubicación cuando activo=true', async () => {
    const { useCase, ubicacionRepo } = buildDeps();
    const ubicacion = UbicacionEntity.create({ nombre: 'Edificio' }, 'ubicacion-uuid');
    ubicacion.desactivar();
    ubicacionRepo.findById.mockResolvedValue(ubicacion);

    const result = await useCase.execute({ ubicacionId: 'ubicacion-uuid', activo: true });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().activo).toBe(true);
  });

  it('falla con UbicacionNoEncontradaError si la ubicación no existe', async () => {
    const { useCase, ubicacionRepo } = buildDeps();
    ubicacionRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute({ ubicacionId: 'inexistente', nombre: 'X' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(UbicacionNoEncontradaError);
  });

  it('falla con UbicacionInvalidaError si el nuevo padreId no existe', async () => {
    const { useCase, ubicacionRepo } = buildDeps();
    const ubicacion = UbicacionEntity.create({ nombre: 'Piso 3' }, 'ubicacion-uuid');
    ubicacionRepo.findById.mockImplementation((id: string) =>
      id === 'ubicacion-uuid' ? Promise.resolve(ubicacion) : Promise.resolve(null),
    );

    const result = await useCase.execute({
      ubicacionId: 'ubicacion-uuid',
      padreId: 'padre-inexistente',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(UbicacionInvalidaError);
  });
});
