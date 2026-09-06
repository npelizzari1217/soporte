import { describe, expect, it, vi } from 'vitest';
import { EditarFamiliaInsumoUseCase } from './editar-familia-insumo.use-case';
import { FamiliaInsumoEntity } from '../../domain/entities/familia-insumo.entity';
import {
  FamiliaInsumoNoEncontradaError,
  FamiliaInsumoCodigoDuplicadoError,
} from '../../domain/errors/familias-insumo.errors';

describe('EditarFamiliaInsumoUseCase', () => {
  function buildRepo(
    familia: FamiliaInsumoEntity | null,
    colisionante: FamiliaInsumoEntity | null = null,
  ) {
    return {
      findById: vi.fn().mockResolvedValue(familia),
      findByCodigo: vi.fn().mockResolvedValue(colisionante),
      save: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('edita nombre sin tocar codigo', async () => {
    const familia = FamiliaInsumoEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    const repo = buildRepo(familia);
    const useCase = new EditarFamiliaInsumoUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', nombre: 'A renombrada' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().nombre).toBe('A renombrada');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('normaliza el codigo nuevo a mayúscula', async () => {
    const familia = FamiliaInsumoEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    const repo = buildRepo(familia);
    const useCase = new EditarFamiliaInsumoUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', codigo: ' cartucho ' });

    expect(result.getValue().codigo).toBe('CARTUCHO');
  });

  /**
   * Mismo recorte que en el alta: si el PATCH no normalizara el `nombre`, un
   * catálogo prolijo se ensuciaría con la primera edición.
   */
  it('recorta los espacios de borde del nombre nuevo', async () => {
    const entidad = FamiliaInsumoEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    const repo = buildRepo(entidad);
    const useCase = new EditarFamiliaInsumoUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', nombre: '  Tóner  ' });

    expect(result.getValue().nombre).toBe('Tóner');
  });

  it('rechaza con FamiliaInsumoNoEncontradaError si el id no existe', async () => {
    const repo = buildRepo(null);
    const useCase = new EditarFamiliaInsumoUseCase(repo);

    const result = await useCase.execute({ id: 'inexistente', nombre: 'X' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(FamiliaInsumoNoEncontradaError);
  });

  it('rechaza con FamiliaInsumoCodigoDuplicadoError si el nuevo codigo choca con OTRA familia', async () => {
    const familia = FamiliaInsumoEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    const otra = FamiliaInsumoEntity.create({ codigo: 'B', nombre: 'B', activo: true }, 'id-2');
    const repo = buildRepo(familia, otra);
    const useCase = new EditarFamiliaInsumoUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', codigo: 'B' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(FamiliaInsumoCodigoDuplicadoError);
  });

  it('re-enviar el mismo codigo actual NO dispara revalidación de duplicado', async () => {
    const familia = FamiliaInsumoEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    const repo = buildRepo(familia);
    const useCase = new EditarFamiliaInsumoUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', codigo: 'A', nombre: 'A editada' });

    expect(result.isOk()).toBe(true);
    expect(repo.findByCodigo).not.toHaveBeenCalled();
  });

  /**
   * La comparación "¿cambió el código?" se hace contra el valor YA normalizado.
   * Comparando el crudo, mandar `a` sobre una familia que ya es `A` dispararía
   * una revalidación que se encuentra a sí misma.
   */
  it('re-enviar el codigo actual en minúscula tampoco dispara revalidación', async () => {
    const familia = FamiliaInsumoEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    const repo = buildRepo(familia);
    const useCase = new EditarFamiliaInsumoUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', codigo: 'a' });

    expect(result.isOk()).toBe(true);
    expect(repo.findByCodigo).not.toHaveBeenCalled();
  });
});
