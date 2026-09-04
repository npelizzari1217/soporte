import { describe, expect, it, vi } from 'vitest';
import { CambiarEstadoActivoFamiliaInsumoUseCase } from './cambiar-estado-activo-familia-insumo.use-case';
import { FamiliaInsumoEntity } from '../../domain/entities/familia-insumo.entity';
import { FamiliaInsumoNoEncontradaError } from '../../domain/errors/familias-insumo.errors';

describe('CambiarEstadoActivoFamiliaInsumoUseCase', () => {
  it('desactiva una familia activa', async () => {
    const familia = FamiliaInsumoEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    const repo = {
      findById: vi.fn().mockResolvedValue(familia),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new CambiarEstadoActivoFamiliaInsumoUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', activo: false });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().activo).toBe(false);
  });

  it('reactiva una familia desactivada (caso hermano)', async () => {
    const familia = FamiliaInsumoEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    familia.desactivar();
    const repo = {
      findById: vi.fn().mockResolvedValue(familia),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new CambiarEstadoActivoFamiliaInsumoUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', activo: true });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().activo).toBe(true);
  });

  it('rechaza con FamiliaInsumoNoEncontradaError si el id no existe', async () => {
    const repo = { findById: vi.fn().mockResolvedValue(null), save: vi.fn() };
    const useCase = new CambiarEstadoActivoFamiliaInsumoUseCase(repo);

    const result = await useCase.execute({ id: 'nope', activo: false });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(FamiliaInsumoNoEncontradaError);
  });
});
