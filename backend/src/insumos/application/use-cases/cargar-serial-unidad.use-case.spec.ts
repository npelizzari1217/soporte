import { describe, expect, it, vi } from 'vitest';
import { Result } from '../../../shared/domain/result';
import { CargarSerialUnidadUseCase } from './cargar-serial-unidad.use-case';
import { CorregirSerialUnidadUseCase } from './corregir-serial-unidad.use-case';
import { UnidadInsumoEntity } from '../../domain/entities/unidad-insumo.entity';
import { FalloOperacionDeUnidad } from '../../domain/errors/fallo-operacion-de-unidad';
import {
  SerialDuplicadoError,
  UnidadNoEncontradaError,
} from '../../domain/errors/unidades-insumo.errors';
import { txRunnerFake } from '../../testing/tx-runner-fake';

const ahora = new Date('2026-01-01T00:00:00Z');
const UNIDAD = UnidadInsumoEntity.reconstitute(
  {
    insumoId: 'ins-1',
    numeroSerie: null,
    numeroSerieNormalizado: null,
    condicion: 'NUEVO',
    estado: 'EN_DEPOSITO',
    equipoId: null,
  },
  'u-1',
  ahora,
  ahora,
);
const unidadRepo = { findById: async (id: string) => (id === 'u-1' ? UNIDAD : null) };

describe('CargarSerialUnidadUseCase', () => {
  it('abre UNA transacción y delega con el usuario', async () => {
    const tx = txRunnerFake();
    const cargarSerial = vi.fn(async () => Result.ok(UNIDAD));
    const useCase = new CargarSerialUnidadUseCase(unidadRepo, tx, { cargarSerial });

    const r = await useCase.execute({
      insumoId: 'ins-1',
      unidadId: 'u-1',
      numeroSerie: 'SN-1',
      usuarioId: 'usr-1',
    });

    expect(r.isOk()).toBe(true);
    expect(tx.abiertas).toBe(1);
    expect(cargarSerial).toHaveBeenCalledWith('u-1', 'SN-1', { usuarioId: 'usr-1' });
  });

  it('una unidad de otro insumo es UnidadNoEncontradaError y no delega', async () => {
    const cargarSerial = vi.fn();
    const useCase = new CargarSerialUnidadUseCase(unidadRepo, txRunnerFake(), {
      cargarSerial,
    });
    const r = await useCase.execute({
      insumoId: 'ins-otro',
      unidadId: 'u-1',
      numeroSerie: 'SN-1',
      usuarioId: 'usr-1',
    });
    expect(r.getError()).toBeInstanceOf(UnidadNoEncontradaError);
    expect(cargarSerial).not.toHaveBeenCalled();
  });

  it('desenvuelve FalloOperacionDeUnidad (P2002) como Result.fail', async () => {
    const useCase = new CargarSerialUnidadUseCase(unidadRepo, txRunnerFake(), {
      cargarSerial: async () => {
        throw new FalloOperacionDeUnidad(new SerialDuplicadoError('SN-1'));
      },
    });
    const r = await useCase.execute({
      insumoId: 'ins-1',
      unidadId: 'u-1',
      numeroSerie: 'SN-1',
      usuarioId: 'usr-1',
    });
    expect(r.getError()).toBeInstanceOf(SerialDuplicadoError);
  });

  it('un error inesperado se propaga', async () => {
    const useCase = new CargarSerialUnidadUseCase(unidadRepo, txRunnerFake(), {
      cargarSerial: async () => {
        throw new Error('boom');
      },
    });
    await expect(
      useCase.execute({ insumoId: 'ins-1', unidadId: 'u-1', numeroSerie: 'x', usuarioId: 'u' }),
    ).rejects.toThrow('boom');
  });
});

describe('CorregirSerialUnidadUseCase', () => {
  it('delega con el motivo y el usuario dentro de una transacción', async () => {
    const tx = txRunnerFake();
    const corregirSerial = vi.fn(async () => Result.ok(UNIDAD));
    const useCase = new CorregirSerialUnidadUseCase(unidadRepo, tx, { corregirSerial });

    const r = await useCase.execute({
      insumoId: 'ins-1',
      unidadId: 'u-1',
      numeroSerie: 'SN-2',
      usuarioId: 'usr-1',
      motivo: 'Error de tipeo',
    });

    expect(r.isOk()).toBe(true);
    expect(tx.abiertas).toBe(1);
    expect(corregirSerial).toHaveBeenCalledWith('u-1', 'SN-2', {
      usuarioId: 'usr-1',
      motivo: 'Error de tipeo',
    });
  });

  it('desenvuelve el serial duplicado y rechaza la unidad ajena', async () => {
    const duplicado = new CorregirSerialUnidadUseCase(unidadRepo, txRunnerFake(), {
      corregirSerial: async () => {
        throw new FalloOperacionDeUnidad(new SerialDuplicadoError('SN-2'));
      },
    });
    const dto = {
      insumoId: 'ins-1',
      unidadId: 'u-1',
      numeroSerie: 'SN-2',
      usuarioId: 'usr-1',
      motivo: 'm',
    };
    expect((await duplicado.execute(dto)).getError()).toBeInstanceOf(SerialDuplicadoError);
    expect((await duplicado.execute({ ...dto, insumoId: 'otro' })).getError()).toBeInstanceOf(
      UnidadNoEncontradaError,
    );
  });
});
