import { describe, expect, it, vi } from 'vitest';
import { EditarUnidadMedidaUseCase } from './editar-unidad-medida.use-case';
import { UnidadMedidaEntity } from '../../domain/entities/unidad-medida.entity';
import {
  UnidadMedidaNoEncontradaError,
  UnidadMedidaCodigoDuplicadoError,
  UnidadMedidaEnUsoPorSerieError,
} from '../../domain/errors/unidades-medida.errors';
import { txRunnerFake } from '../../testing/tx-runner-fake';

describe('EditarUnidadMedidaUseCase', () => {
  function buildRepo(
    unidad: UnidadMedidaEntity | null,
    colisionante: UnidadMedidaEntity | null = null,
  ) {
    return {
      bloquearParaEdicion: vi.fn().mockResolvedValue(unidad),
      findByCodigo: vi.fn().mockResolvedValue(colisionante),
      save: vi.fn().mockResolvedValue(undefined),
    };
  }

  function buildInsumoRepo(enUso = 0) {
    return { contarSeriePorUnidadMedida: vi.fn().mockResolvedValue(enUso) };
  }

  function build(
    unidad: UnidadMedidaEntity | null,
    opciones: { colisionante?: UnidadMedidaEntity | null; enUso?: number } = {},
  ) {
    const repo = buildRepo(unidad, opciones.colisionante ?? null);
    const insumoRepo = buildInsumoRepo(opciones.enUso ?? 0);
    const txRunner = txRunnerFake();
    return {
      repo,
      insumoRepo,
      txRunner,
      useCase: new EditarUnidadMedidaUseCase(repo, insumoRepo, txRunner),
    };
  }

  it('edita nombre sin tocar codigo', async () => {
    const unidad = UnidadMedidaEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    const { repo, useCase } = build(unidad);

    const result = await useCase.execute({ id: 'id-1', nombre: 'A renombrada' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().nombre).toBe('A renombrada');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('normaliza el codigo nuevo a mayúscula', async () => {
    const unidad = UnidadMedidaEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    const { useCase } = build(unidad);

    const result = await useCase.execute({ id: 'id-1', codigo: ' lt ' });

    expect(result.getValue().codigo).toBe('LT');
  });

  /**
   * Mismo recorte que en el alta: si el PATCH no normalizara el `nombre`, un
   * catálogo prolijo se ensuciaría con la primera edición.
   */
  it('recorta los espacios de borde del nombre nuevo', async () => {
    const entidad = UnidadMedidaEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    const { useCase } = build(entidad);

    const result = await useCase.execute({ id: 'id-1', nombre: '  Unidad  ' });

    expect(result.getValue().nombre).toBe('Unidad');
  });

  it('rechaza con UnidadMedidaNoEncontradaError si el id no existe', async () => {
    const { useCase } = build(null);

    const result = await useCase.execute({ id: 'inexistente', nombre: 'X' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(UnidadMedidaNoEncontradaError);
  });

  it('rechaza con UnidadMedidaCodigoDuplicadoError si el nuevo codigo choca con OTRA unidad', async () => {
    const unidad = UnidadMedidaEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    const otra = UnidadMedidaEntity.create({ codigo: 'B', nombre: 'B', activo: true }, 'id-2');
    const { useCase } = build(unidad, { colisionante: otra });

    const result = await useCase.execute({ id: 'id-1', codigo: 'B' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(UnidadMedidaCodigoDuplicadoError);
  });

  it('re-enviar el mismo codigo actual NO dispara revalidación de duplicado', async () => {
    const unidad = UnidadMedidaEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    const { repo, useCase } = build(unidad);

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
    const { repo, useCase } = build(unidad);

    const result = await useCase.execute({ id: 'id-1', codigo: 'a' });

    expect(result.isOk()).toBe(true);
    expect(repo.findByCodigo).not.toHaveBeenCalled();
  });

  describe('entera y locks (ADR-12, L0)', () => {
    const unidadEntera = () =>
      UnidadMedidaEntity.create(
        { codigo: 'UNI', nombre: 'Unidad', activo: true, entera: true },
        'id-1',
      );
    const unidadComun = () =>
      UnidadMedidaEntity.create({ codigo: 'LT', nombre: 'Litro', activo: true }, 'id-2');

    it('marca entera una unidad propia', async () => {
      const { useCase, repo, insumoRepo } = build(unidadComun());

      const result = await useCase.execute({ id: 'id-2', entera: true });

      expect(result.getValue().entera).toBe(true);
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(insumoRepo.contarSeriePorUnidadMedida).not.toHaveBeenCalled();
    });

    it('desmarca entera si ningun insumo SERIE la usa', async () => {
      const { useCase, repo, insumoRepo } = build(unidadEntera(), { enUso: 0 });

      const result = await useCase.execute({ id: 'id-1', entera: false });

      expect(result.getValue().entera).toBe(false);
      expect(insumoRepo.contarSeriePorUnidadMedida).toHaveBeenCalledWith('id-1');
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('rechaza desmarcar entera con un insumo SERIE en uso y no escribe nada', async () => {
      const unidad = unidadEntera();
      const { useCase, repo } = build(unidad, { enUso: 1 });

      const result = await useCase.execute({ id: 'id-1', entera: false, nombre: 'Otro' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(UnidadMedidaEnUsoPorSerieError);
      expect(repo.save).not.toHaveBeenCalled();
      expect(unidad.entera).toBe(true);
      expect(unidad.nombre).toBe('Unidad');
    });

    it('no cuenta insumos si la unidad ya no era entera o si entera no viene', async () => {
      const comun = build(unidadComun());
      await comun.useCase.execute({ id: 'id-2', entera: false });
      const sinEntera = build(unidadEntera());
      await sinEntera.useCase.execute({ id: 'id-1', nombre: 'Unidad 2' });

      expect(comun.insumoRepo.contarSeriePorUnidadMedida).not.toHaveBeenCalled();
      expect(sinEntera.insumoRepo.contarSeriePorUnidadMedida).not.toHaveBeenCalled();
    });

    it('renombrar el codigo de una unidad entera usada por SERIE no toca entera', async () => {
      const { useCase } = build(unidadEntera(), { enUso: 3 });

      const result = await useCase.execute({ id: 'id-1', codigo: 'unidad' });

      expect(result.getValue().codigo).toBe('UNIDAD');
      expect(result.getValue().entera).toBe(true);
    });

    it.each([
      [{ nombre: 'X' }, 'SIN_CAMBIO_DE_CODIGO'],
      [{ entera: true }, 'SIN_CAMBIO_DE_CODIGO'],
      [{ codigo: 'LT' }, 'CAMBIA_CODIGO'],
      [{ codigo: 'OTRA', entera: false }, 'CAMBIA_CODIGO'],
    ] as const)('toma L0 en modo correcto para %j', async (campos, modo) => {
      const { useCase, repo } = build(unidadComun());

      await useCase.execute({ id: 'id-2', ...campos });

      expect(repo.bloquearParaEdicion).toHaveBeenCalledWith('id-2', modo);
    });

    it('toma L0 ANTES de buscar duplicados y de contar insumos, todo en una sola transaccion', async () => {
      const unidad = unidadEntera();
      const { useCase, repo, insumoRepo, txRunner } = build(unidad);

      await useCase.execute({ id: 'id-1', codigo: 'NUEVO', entera: false });

      const orden = (m: { mock: { invocationCallOrder: number[] } }) =>
        m.mock.invocationCallOrder[0];
      expect(orden(repo.bloquearParaEdicion)).toBeLessThan(orden(repo.findByCodigo));
      expect(orden(repo.bloquearParaEdicion)).toBeLessThan(
        orden(insumoRepo.contarSeriePorUnidadMedida),
      );
      expect(txRunner.abiertas).toBe(1);
    });
  });
});
