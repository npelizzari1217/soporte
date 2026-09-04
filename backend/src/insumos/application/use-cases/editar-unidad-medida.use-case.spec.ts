import { describe, expect, it, vi } from 'vitest';
import { EditarUnidadMedidaUseCase } from './editar-unidad-medida.use-case';
import { UnidadMedidaEntity } from '../../domain/entities/unidad-medida.entity';
import {
  UnidadMedidaNoEncontradaError,
  UnidadMedidaCodigoDuplicadoError,
} from '../../domain/errors/unidades-medida.errors';

describe('EditarUnidadMedidaUseCase', () => {
  function buildRepo(
    unidad: UnidadMedidaEntity | null,
    colisionante: UnidadMedidaEntity | null = null,
  ) {
    return {
      findById: vi.fn().mockResolvedValue(unidad),
      findByCodigo: vi.fn().mockResolvedValue(colisionante),
      save: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('edita nombre sin tocar codigo', async () => {
    const unidad = UnidadMedidaEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    const repo = buildRepo(unidad);
    const useCase = new EditarUnidadMedidaUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', nombre: 'A renombrada' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().nombre).toBe('A renombrada');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('normaliza el codigo nuevo a mayúscula', async () => {
    const unidad = UnidadMedidaEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    const repo = buildRepo(unidad);
    const useCase = new EditarUnidadMedidaUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', codigo: ' lt ' });

    expect(result.getValue().codigo).toBe('LT');
  });

  /**
   * Mismo recorte que en el alta: si el PATCH no normalizara el `nombre`, un
   * catálogo prolijo se ensuciaría con la primera edición.
   */
  it('recorta los espacios de borde del nombre nuevo', async () => {
    const entidad = UnidadMedidaEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    const repo = buildRepo(entidad);
    const useCase = new EditarUnidadMedidaUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', nombre: '  Unidad  ' });

    expect(result.getValue().nombre).toBe('Unidad');
  });

  it('rechaza con UnidadMedidaNoEncontradaError si el id no existe', async () => {
    const repo = buildRepo(null);
    const useCase = new EditarUnidadMedidaUseCase(repo);

    const result = await useCase.execute({ id: 'inexistente', nombre: 'X' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(UnidadMedidaNoEncontradaError);
  });

  it('rechaza con UnidadMedidaCodigoDuplicadoError si el nuevo codigo choca con OTRA unidad', async () => {
    const unidad = UnidadMedidaEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    const otra = UnidadMedidaEntity.create({ codigo: 'B', nombre: 'B', activo: true }, 'id-2');
    const repo = buildRepo(unidad, otra);
    const useCase = new EditarUnidadMedidaUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', codigo: 'B' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(UnidadMedidaCodigoDuplicadoError);
  });

  it('re-enviar el mismo codigo actual NO dispara revalidación de duplicado', async () => {
    const unidad = UnidadMedidaEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    const repo = buildRepo(unidad);
    const useCase = new EditarUnidadMedidaUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', codigo: 'A', nombre: 'A editada' });

    expect(result.isOk()).toBe(true);
    expect(repo.findByCodigo).not.toHaveBeenCalled();
  });

  /**
   * La comparación "¿cambió el código?" se hace contra el valor YA normalizado.
   * Comparando el crudo, mandar `a` sobre una unidad que ya es `A` dispararía
   * una revalidación que se encuentra a sí misma.
   */
  it('re-enviar el codigo actual en minúscula tampoco dispara revalidación', async () => {
    const unidad = UnidadMedidaEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    const repo = buildRepo(unidad);
    const useCase = new EditarUnidadMedidaUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', codigo: 'a' });

    expect(result.isOk()).toBe(true);
    expect(repo.findByCodigo).not.toHaveBeenCalled();
  });
});
