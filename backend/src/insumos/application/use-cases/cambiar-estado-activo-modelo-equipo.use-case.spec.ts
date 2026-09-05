import { describe, expect, it, vi } from 'vitest';
import { CambiarEstadoActivoModeloEquipoUseCase } from './cambiar-estado-activo-modelo-equipo.use-case';
import { ModeloEquipoEntity } from '../../domain/entities/modelo-equipo.entity';
import { ModeloEquipoNoEncontradoError } from '../../domain/errors/modelos-equipo.errors';

describe('CambiarEstadoActivoModeloEquipoUseCase', () => {
  it('desactiva un modelo activo', async () => {
    const modelo = ModeloEquipoEntity.create({ marca: 'HP', modelo: 'M404', activo: true }, 'id-1');
    const repo = {
      findById: vi.fn().mockResolvedValue(modelo),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new CambiarEstadoActivoModeloEquipoUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', activo: false });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().activo).toBe(false);
  });

  it('reactiva un modelo desactivado (caso hermano)', async () => {
    const modelo = ModeloEquipoEntity.create({ marca: 'HP', modelo: 'M404', activo: true }, 'id-1');
    modelo.desactivar();
    const repo = {
      findById: vi.fn().mockResolvedValue(modelo),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new CambiarEstadoActivoModeloEquipoUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', activo: true });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().activo).toBe(true);
  });

  it('rechaza con ModeloEquipoNoEncontradoError si el id no existe', async () => {
    const repo = { findById: vi.fn().mockResolvedValue(null), save: vi.fn() };
    const useCase = new CambiarEstadoActivoModeloEquipoUseCase(repo);

    const result = await useCase.execute({ id: 'nope', activo: false });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ModeloEquipoNoEncontradoError);
  });
});
