import { describe, it, expect, vi } from 'vitest';
import { AgregarComponenteSinDescuentoUseCase } from './agregar-componente-sin-descuento.use-case';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import { UnidadInsumoEntity } from '../../../insumos/domain/entities/unidad-insumo.entity';
import { FalloOperacionDeUnidad } from '../../../insumos/domain/errors/fallo-operacion-de-unidad';
import {
  SerialDuplicadoError,
  SerialRequeridoError,
  UnidadNoAdmitidaError,
} from '../../../insumos/domain/errors/unidades-insumo.errors';
import {
  EquipoNoEncontradoError,
  UnidadConAltaSinDescuentoError,
} from '../../domain/errors/equipos.errors';
import { Result } from '../../../shared/domain/result';
import { txRunnerFake } from '../../../insumos/testing/tx-runner-fake';

/**
 * WU-10b (sdd/repuestos-numero-de-serie, D3) — alta sin descuento.
 *
 * Unit: prueba la ORQUESTACIÓN y el orden de la invariante L (preparar → altaInstalada →
 * save). La atomicidad real contra Postgres (serial repetido revierte el alta) vive en el
 * e2e `equipos-instalar-desde-deposito.e2e.spec.ts`.
 */
describe('AgregarComponenteSinDescuentoUseCase', () => {
  const dto = {
    equipoId: 'equipo-1',
    insumoId: 'insumo-1',
    usuarioId: 'usuario-1',
    numeroSerie: 'SN-1',
  };

  function armar(
    opts: {
      seguimiento?: 'SERIE' | 'NINGUNO';
      altaInstalada?: ReturnType<typeof vi.fn>;
      preparar?: ReturnType<typeof vi.fn>;
    } = {},
  ) {
    const componente = ComponenteEquipoEntity.create({
      equipoId: dto.equipoId,
      insumoId: dto.insumoId,
      descripcion: null,
      numeroSerie: 'SN-1',
      capacidad: null,
    }).getValue();
    const unidad = UnidadInsumoEntity.crearInstalada({
      insumoId: dto.insumoId,
      condicion: 'NUEVO',
      numeroSerie: 'SN-1',
      equipoId: dto.equipoId,
    }).getValue();
    const txRunner = txRunnerFake();
    const preparar = opts.preparar ?? vi.fn().mockResolvedValue(Result.ok(componente));
    const altaInstalada = opts.altaInstalada ?? vi.fn().mockResolvedValue(Result.ok(unidad));
    const save = vi.fn().mockResolvedValue(undefined);
    const findById = vi.fn().mockResolvedValue(null);
    const insumoRepo = {
      findById: vi.fn().mockResolvedValue({ seguimiento: opts.seguimiento ?? 'SERIE' }),
    };
    const useCase = new AgregarComponenteSinDescuentoUseCase(
      txRunner,
      { preparar } as never,
      insumoRepo as never,
      { altaInstalada } as never,
      { save, findById } as never,
    );
    return { useCase, componente, unidad, txRunner, preparar, altaInstalada, save };
  }

  it('SERIE: preparar → altaInstalada → save, en una transacción, con el componente ligado a la unidad', async () => {
    const { useCase, componente, unidad, txRunner, preparar, altaInstalada, save } = armar();

    const result = await useCase.execute({ ...dto, condicion: 'USADO' });

    expect(result.isOk()).toBe(true);
    expect(txRunner.abiertas).toBe(1);
    expect(altaInstalada).toHaveBeenCalledWith('insumo-1', 'SN-1', 'equipo-1', {
      usuarioId: 'usuario-1',
      condicion: 'USADO',
      componenteId: componente.id,
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(componente.unidadId).toBe(unidad.id);
    expect(componente.numeroSerie).toBeNull();
    // Orden de ADR-12: el componente (L4) se guarda DESPUÉS de los locks de la unidad.
    expect(preparar.mock.invocationCallOrder[0]).toBeLessThan(
      altaInstalada.mock.invocationCallOrder[0],
    );
    expect(altaInstalada.mock.invocationCallOrder[0]).toBeLessThan(
      save.mock.invocationCallOrder[0],
    );
  });

  it('SERIE sin condición: la unidad nace NUEVO', async () => {
    const { useCase, altaInstalada } = armar();

    await useCase.execute(dto);

    expect(altaInstalada.mock.calls[0][3]).toMatchObject({ condicion: 'NUEVO' });
  });

  it('SERIE sin serial: SerialRequeridoError y no se guarda nada', async () => {
    const altaInstalada = vi.fn().mockResolvedValue(Result.fail(new SerialRequeridoError('falta')));
    const { useCase, save } = armar({ altaInstalada });

    const result = await useCase.execute({ ...dto, numeroSerie: null });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SerialRequeridoError);
    expect(altaInstalada.mock.calls[0][1]).toBe('');
    expect(save).not.toHaveBeenCalled();
  });

  it('SERIE con serial repetido (P2002 lanzado dentro de run): Result.fail SerialDuplicadoError y no se guarda el componente', async () => {
    const altaInstalada = vi
      .fn()
      .mockRejectedValue(new FalloOperacionDeUnidad(new SerialDuplicadoError('SN-1')));
    const { useCase, save } = armar({ altaInstalada });

    const result = await useCase.execute(dto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SerialDuplicadoError);
    expect(save).not.toHaveBeenCalled();
  });

  it('un Result.fail de altaInstalada se devuelve tal cual, sin guardar el componente', async () => {
    const altaInstalada = vi
      .fn()
      .mockResolvedValue(Result.fail(new UnidadNoAdmitidaError('insumo-1')));
    const { useCase, save } = armar({ altaInstalada });

    const result = await useCase.execute(dto);

    expect(result.getError()).toBeInstanceOf(UnidadNoAdmitidaError);
    expect(save).not.toHaveBeenCalled();
  });

  it('lo que no es FalloOperacionDeUnidad sigue propagando', async () => {
    const altaInstalada = vi.fn().mockRejectedValue(new Error('base caída'));
    const { useCase } = armar({ altaInstalada });

    await expect(useCase.execute(dto)).rejects.toThrow('base caída');
  });

  it('NINGUNO: alta de siempre, sin tocar unidades; el serial queda como texto del componente y la condición se ignora', async () => {
    const { useCase, componente, altaInstalada, save } = armar({ seguimiento: 'NINGUNO' });

    const result = await useCase.execute({ ...dto, condicion: 'USADO' });

    expect(result.getValue()).toBe(componente);
    expect(altaInstalada).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith(componente);
    expect(componente.unidadId).toBeNull();
    expect(componente.numeroSerie).toBe('SN-1');
  });

  it('unidadId con descontarStock false se rechaza (UnidadConAltaSinDescuentoError) sin validar ni escribir nada', async () => {
    const { useCase, txRunner, preparar, altaInstalada, save } = armar();

    const result = await useCase.execute({ ...dto, unidadId: 'unidad-1' });

    expect(result.getError()).toBeInstanceOf(UnidadConAltaSinDescuentoError);
    expect(txRunner.abiertas).toBe(0);
    expect(preparar).not.toHaveBeenCalled();
    expect(altaInstalada).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('si preparar() falla, no se toca la unidad ni se guarda nada', async () => {
    const preparar = vi
      .fn()
      .mockResolvedValue(Result.fail(new EquipoNoEncontradoError('equipo-1')));
    const { useCase, altaInstalada, save } = armar({ preparar });

    const result = await useCase.execute(dto);

    expect(result.getError()).toBeInstanceOf(EquipoNoEncontradoError);
    expect(altaInstalada).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
