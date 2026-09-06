import { describe, expect, it, vi } from 'vitest';
import { CrearModeloEquipoUseCase } from './crear-modelo-equipo.use-case';
import { IModeloEquipoRepository } from '../../domain/ports/i-modelo-equipo.repository';
import { ModeloEquipoDuplicadoError } from '../../domain/errors/modelos-equipo.errors';
import { ModeloEquipoEntity } from '../../domain/entities/modelo-equipo.entity';

describe('CrearModeloEquipoUseCase', () => {
  function buildRepo(
    overrides: Partial<Pick<IModeloEquipoRepository, 'findByMarcaModelo' | 'save'>> = {},
  ) {
    return {
      findByMarcaModelo: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it('crea el modelo cuando el par marca+modelo no está en uso', async () => {
    const repo = buildRepo();
    const useCase = new CrearModeloEquipoUseCase(repo);

    const result = await useCase.execute({ marca: 'HP', modelo: 'LaserJet Pro M404' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().marca).toBe('HP');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  /**
   * `modelos_equipo` tiene `UNIQUE (marca, modelo)` case-sensitive: sin
   * normalizar acá, `hp` y `HP` entrarían como dos marcas distintas y el
   * catálogo quedaría con duplicados que el UNIQUE no puede frenar.
   */
  it('normaliza la marca a mayúscula antes de persistir', async () => {
    const repo = buildRepo();
    const useCase = new CrearModeloEquipoUseCase(repo);

    const result = await useCase.execute({ marca: '  hp  ', modelo: 'LaserJet Pro M404' });

    expect(result.getValue().marca).toBe('HP');
  });

  /**
   * El `modelo` se recorta pero NO se grita: la designación comercial se lee
   * tal como la escribió el fabricante. Gritarla dejaría el catálogo lleno de
   * "LASERJET PRO M404", que no es como figura en la máquina.
   */
  it('recorta los espacios del modelo pero le conserva mayúsculas y minúsculas', async () => {
    const repo = buildRepo();
    const useCase = new CrearModeloEquipoUseCase(repo);

    const result = await useCase.execute({ marca: 'HP', modelo: '  LaserJet Pro M404  ' });

    expect(result.getValue().modelo).toBe('LaserJet Pro M404');
  });

  it('busca el duplicado por el par YA normalizado', async () => {
    const repo = buildRepo();
    const useCase = new CrearModeloEquipoUseCase(repo);

    await useCase.execute({ marca: ' hp ', modelo: ' LaserJet Pro M404 ' });

    expect(repo.findByMarcaModelo).toHaveBeenCalledWith('HP', 'LaserJet Pro M404');
  });

  it('rechaza con ModeloEquipoDuplicadoError si el par ya existe (habilitado o no)', async () => {
    const existente = ModeloEquipoEntity.create({
      marca: 'HP',
      modelo: 'LaserJet Pro M404',
      activo: false,
    });
    const repo = buildRepo({ findByMarcaModelo: vi.fn().mockResolvedValue(existente) });
    const useCase = new CrearModeloEquipoUseCase(repo);

    const result = await useCase.execute({ marca: 'HP', modelo: 'LaserJet Pro M404' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ModeloEquipoDuplicadoError);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
