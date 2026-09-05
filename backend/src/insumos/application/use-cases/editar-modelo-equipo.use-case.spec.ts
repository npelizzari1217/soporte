import { describe, expect, it, vi } from 'vitest';
import { EditarModeloEquipoUseCase } from './editar-modelo-equipo.use-case';
import { ModeloEquipoEntity } from '../../domain/entities/modelo-equipo.entity';
import {
  ModeloEquipoNoEncontradoError,
  ModeloEquipoDuplicadoError,
} from '../../domain/errors/modelos-equipo.errors';

describe('EditarModeloEquipoUseCase', () => {
  function buildRepo(
    modelo: ModeloEquipoEntity | null,
    colisionante: ModeloEquipoEntity | null = null,
  ) {
    return {
      findById: vi.fn().mockResolvedValue(modelo),
      findByMarcaModelo: vi.fn().mockResolvedValue(colisionante),
      save: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('edita el modelo sin tocar la marca', async () => {
    const entidad = ModeloEquipoEntity.create(
      { marca: 'HP', modelo: 'M404', activo: true },
      'id-1',
    );
    const repo = buildRepo(entidad);
    const useCase = new EditarModeloEquipoUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', modelo: 'M404dn' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().modelo).toBe('M404dn');
    expect(result.getValue().marca).toBe('HP');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('normaliza la marca nueva a mayúscula', async () => {
    const entidad = ModeloEquipoEntity.create(
      { marca: 'HP', modelo: 'M404', activo: true },
      'id-1',
    );
    const repo = buildRepo(entidad);
    const useCase = new EditarModeloEquipoUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', marca: ' brother ' });

    expect(result.getValue().marca).toBe('BROTHER');
  });

  /** Mismo criterio que en el alta: el modelo se recorta, no se grita. */
  it('recorta el modelo nuevo conservando mayúsculas y minúsculas', async () => {
    const entidad = ModeloEquipoEntity.create(
      { marca: 'HP', modelo: 'M404', activo: true },
      'id-1',
    );
    const repo = buildRepo(entidad);
    const useCase = new EditarModeloEquipoUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', modelo: '  LaserJet Pro M404  ' });

    expect(result.getValue().modelo).toBe('LaserJet Pro M404');
  });

  it('rechaza con ModeloEquipoNoEncontradoError si el id no existe', async () => {
    const repo = buildRepo(null);
    const useCase = new EditarModeloEquipoUseCase(repo);

    const result = await useCase.execute({ id: 'inexistente', modelo: 'X' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ModeloEquipoNoEncontradoError);
  });

  it('rechaza con ModeloEquipoDuplicadoError si el par nuevo choca con OTRO modelo', async () => {
    const entidad = ModeloEquipoEntity.create(
      { marca: 'HP', modelo: 'M404', activo: true },
      'id-1',
    );
    const otro = ModeloEquipoEntity.create({ marca: 'HP', modelo: 'M428', activo: true }, 'id-2');
    const repo = buildRepo(entidad, otro);
    const useCase = new EditarModeloEquipoUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', modelo: 'M428' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ModeloEquipoDuplicadoError);
  });

  /**
   * La unicidad es del PAR: cambiar SOLO la marca también puede chocar contra
   * otra fila. Revalidando únicamente cuando cambia el `modelo`, mover
   * "BROTHER M404" a "HP M404" pasaría el chequeo de la aplicación y explotaría
   * recién contra el UNIQUE de Postgres, como un 500 sin mensaje de negocio.
   */
  it('revalida el par cuando cambia SOLO la marca', async () => {
    const entidad = ModeloEquipoEntity.create(
      { marca: 'BROTHER', modelo: 'M404', activo: true },
      'id-1',
    );
    const otro = ModeloEquipoEntity.create({ marca: 'HP', modelo: 'M404', activo: true }, 'id-2');
    const repo = buildRepo(entidad, otro);
    const useCase = new EditarModeloEquipoUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', marca: 'HP' });

    expect(repo.findByMarcaModelo).toHaveBeenCalledWith('HP', 'M404');
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ModeloEquipoDuplicadoError);
  });

  it('re-enviar el mismo par actual NO dispara revalidación de duplicado', async () => {
    const entidad = ModeloEquipoEntity.create(
      { marca: 'HP', modelo: 'M404', activo: true },
      'id-1',
    );
    const repo = buildRepo(entidad);
    const useCase = new EditarModeloEquipoUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', marca: 'HP', modelo: 'M404' });

    expect(result.isOk()).toBe(true);
    expect(repo.findByMarcaModelo).not.toHaveBeenCalled();
  });

  /**
   * La comparación "¿cambió el par?" se hace contra los valores YA
   * normalizados. Comparando el crudo, mandar `hp` sobre un modelo que ya es
   * `HP` dispararía una revalidación que se encuentra a sí misma.
   */
  it('re-enviar la marca actual en minúscula tampoco dispara revalidación', async () => {
    const entidad = ModeloEquipoEntity.create(
      { marca: 'HP', modelo: 'M404', activo: true },
      'id-1',
    );
    const repo = buildRepo(entidad);
    const useCase = new EditarModeloEquipoUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', marca: ' hp ' });

    expect(result.isOk()).toBe(true);
    expect(repo.findByMarcaModelo).not.toHaveBeenCalled();
  });
});
