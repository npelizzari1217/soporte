/**
 * T8.5 [UNIT][RED→GREEN] — `ListarUbicacionesUseCase`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E2. Tarea: T8.5.
 */
import { UbicacionEntity } from '../../domain/entities/ubicacion.entity';
import { ListarUbicacionesUseCase } from './listar-ubicaciones.use-case';

describe('ListarUbicacionesUseCase', () => {
  it('retorna todas las ubicaciones del tenant', async () => {
    const ubicacion = UbicacionEntity.create({ nombre: 'Edificio Central' }, 'ubicacion-uuid');
    const ubicacionRepo = { findAll: vi.fn().mockResolvedValue([ubicacion]) };
    const useCase = new ListarUbicacionesUseCase(ubicacionRepo as any);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([ubicacion]);
  });
});
