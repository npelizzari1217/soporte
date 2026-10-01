import { describe, expect, it, vi } from 'vitest';
import { Result } from '../../../shared/domain/result';
import { InsumoEntity } from '../../domain/entities/insumo.entity';
import { MovimientoInsumoEntity } from '../../domain/entities/movimiento-insumo.entity';
import { UnidadInsumoEntity } from '../../domain/entities/unidad-insumo.entity';
import { FalloOperacionDeUnidad } from '../../domain/errors/fallo-operacion-de-unidad';
import {
  MotivoRecuperacionRequeridoError,
  SeguimientoNoModificableError,
  SerialDuplicadoError,
  UnidadNoDisponibleError,
  UnidadNoEncontradaError,
} from '../../domain/errors/unidades-insumo.errors';
import { familiaRepoFake } from '../../testing/familia-repo-fake';
import { txRunnerFake } from '../../testing/tx-runner-fake';
import type { OperacionesUnidadInsumo } from '../services/operaciones-unidad-insumo.service';
import { RecuperarUnidadDescartadaUseCase } from './recuperar-unidad-descartada.use-case';

const ahora = new Date('2026-01-01T00:00:00Z');

function propsDeInsumo(activo: boolean) {
  return {
    codigo: 'PLA-001',
    nombre: 'Placa madre',
    familiaId: 'fam-1',
    unidadMedidaId: 'uni-1',
    stockMinimo: null,
    activo,
    codigosAlternativos: [],
    compatibilidad: [],
  };
}

const insumoVigente = (): InsumoEntity => InsumoEntity.create(propsDeInsumo(true), 'ins-1');
const insumoDeshabilitado = (): InsumoEntity => InsumoEntity.create(propsDeInsumo(false), 'ins-1');
/** La baja lógica solo se construye rehidratando una fila con `deletedAt`, como devuelve `findById()`. */
const insumoDadoDeBaja = (): InsumoEntity =>
  InsumoEntity.reconstitute(propsDeInsumo(true), 'ins-1', ahora, ahora, new Date('2026-02-01'));

function unidad(insumoId = 'ins-1'): UnidadInsumoEntity {
  return UnidadInsumoEntity.reconstitute(
    {
      insumoId,
      numeroSerie: 'SN-1',
      numeroSerieNormalizado: 'SN-1',
      condicion: 'NUEVO',
      estado: 'DESCARTADA',
      equipoId: null,
    },
    'u-1',
    ahora,
    ahora,
  );
}

function movimientoEntrada(condicion: 'NUEVO' | 'USADO'): MovimientoInsumoEntity {
  return MovimientoInsumoEntity.create({
    insumoId: 'ins-1',
    tipo: 'ENTRADA',
    condicion,
    cantidad: 1,
    usuarioId: 'usr-1',
    unidadId: 'u-1',
  }).getValue();
}

function armar(
  opciones: {
    insumo?: InsumoEntity | null;
    seguimiento?: 'NINGUNO' | 'SERIE';
    familia?: Parameters<typeof familiaRepoFake>[0];
    unidadDeInsumo?: string | null;
    recuperarDescartadas?: OperacionesUnidadInsumo['recuperarDescartadas'];
  } = {},
) {
  const insumo = opciones.insumo === undefined ? insumoVigente() : opciones.insumo;
  const insumoRepo = {
    findById: vi.fn().mockResolvedValue(insumo),
    leerSeguimientoParaMovimiento: vi
      .fn()
      .mockResolvedValue(insumo ? (opciones.seguimiento ?? 'SERIE') : null),
  };
  const fila = opciones.unidadDeInsumo === null ? null : unidad(opciones.unidadDeInsumo);
  const unidadRepo = { findById: vi.fn().mockResolvedValue(fila) };
  const familiaRepo = familiaRepoFake(opciones.familia);
  const tx = txRunnerFake();
  const recuperarDescartadas = vi.fn<OperacionesUnidadInsumo['recuperarDescartadas']>(
    opciones.recuperarDescartadas ??
      (async (_i, _u, o) =>
        Result.ok([{ unidad: unidad(), movimiento: movimientoEntrada(o.condicion) }])),
  );
  const useCase = new RecuperarUnidadDescartadaUseCase(insumoRepo, unidadRepo, familiaRepo, tx, {
    recuperarDescartadas,
  });
  return { useCase, insumoRepo, familiaRepo, tx, recuperarDescartadas };
}

const dto = {
  insumoId: 'ins-1',
  unidadId: 'u-1',
  condicion: 'NUEVO' as const,
  motivo: 'Se dio de baja por error',
  usuarioId: 'usr-1',
};

describe('RecuperarUnidadDescartadaUseCase', () => {
  it('recupera NUEVO dentro de UNA transacción, con L1 leído antes de delegar', async () => {
    const { useCase, tx, insumoRepo, recuperarDescartadas } = armar();

    const r = await useCase.execute({ ...dto, motivo: '  No se usó  ' });

    expect(r.isOk()).toBe(true);
    expect(r.getValue()).toMatchObject({ tipo: 'ENTRADA', cantidad: 1, condicion: 'NUEVO' });
    expect(tx.abiertas).toBe(1);
    expect(recuperarDescartadas).toHaveBeenCalledWith('ins-1', ['u-1'], {
      usuarioId: 'usr-1',
      motivo: 'No se usó',
      condicion: 'NUEVO',
    });
    expect(insumoRepo.leerSeguimientoParaMovimiento.mock.invocationCallOrder[0]).toBeLessThan(
      recuperarDescartadas.mock.invocationCallOrder[0],
    );
  });

  it('recupera USADO cuando la familia es de repuestos', async () => {
    const { useCase, recuperarDescartadas } = armar();

    const r = await useCase.execute({ ...dto, condicion: 'USADO' });

    expect(r.getValue().condicion).toBe('USADO');
    expect(recuperarDescartadas).toHaveBeenCalledWith('ins-1', ['u-1'], {
      usuarioId: 'usr-1',
      motivo: 'Se dio de baja por error',
      condicion: 'USADO',
    });
  });

  it('sin motivo, en blanco o de más de 500 caracteres es MotivoRecuperacionRequeridoError y no delega', async () => {
    for (const motivo of [null, '', '   ', 'x'.repeat(501)]) {
      const { useCase, recuperarDescartadas } = armar();
      const r = await useCase.execute({ ...dto, motivo });
      expect(r.getError()).toBeInstanceOf(MotivoRecuperacionRequeridoError);
      expect(recuperarDescartadas).not.toHaveBeenCalled();
    }
  });

  it('propaga la unidad no descartada sin escribir nada', async () => {
    const { useCase } = armar({
      recuperarDescartadas: async () =>
        Result.fail(new UnidadNoDisponibleError('u-1', 'no está descartada.')),
    });
    const r = await useCase.execute(dto);
    expect(r.getError()).toBeInstanceOf(UnidadNoDisponibleError);
  });

  it('un insumo NINGUNO lo rechaza el servicio con SeguimientoNoModificableError', async () => {
    const { useCase } = armar({
      seguimiento: 'NINGUNO',
      recuperarDescartadas: async () => Result.fail(new SeguimientoNoModificableError('x')),
    });
    const r = await useCase.execute(dto);
    expect(r.getError()).toBeInstanceOf(SeguimientoNoModificableError);
  });

  it('una unidad inexistente o de otro insumo es UnidadNoEncontradaError y no delega', async () => {
    for (const unidadDeInsumo of [null, 'ins-otro']) {
      const { useCase, recuperarDescartadas } = armar({ unidadDeInsumo });
      const r = await useCase.execute(dto);
      expect(r.getError()).toBeInstanceOf(UnidadNoEncontradaError);
      expect(recuperarDescartadas).not.toHaveBeenCalled();
    }
  });

  it('un insumo inexistente o dado de baja se rechaza', async () => {
    for (const insumo of [null, insumoDadoDeBaja()]) {
      const { useCase, recuperarDescartadas } = armar({ insumo });
      const r = await useCase.execute(dto);
      expect(r.getError().code).toBe('INSUMO_NO_ENCONTRADO');
      expect(recuperarDescartadas).not.toHaveBeenCalled();
    }
  });

  it('G2: admite un insumo deshabilitado, con NUEVO y con USADO', async () => {
    for (const condicion of ['NUEVO', 'USADO'] as const) {
      const { useCase } = armar({ insumo: insumoDeshabilitado() });
      const r = await useCase.execute({ ...dto, condicion });
      expect(r.isOk()).toBe(true);
    }
  });

  it('G2: admite USADO con la familia dada de baja o deshabilitada', async () => {
    for (const familia of [{ dadaDeBaja: true }, { activo: false }]) {
      const { useCase } = armar({ familia });
      const r = await useCase.execute({ ...dto, condicion: 'USADO' });
      expect(r.isOk()).toBe(true);
    }
  });

  it('con esRepuesto = false rechaza USADO aunque la familia no esté vigente, y admite NUEVO', async () => {
    for (const familia of [{ esRepuesto: false }, { esRepuesto: false, activo: false }]) {
      const { useCase, recuperarDescartadas } = armar({ familia });
      const usado = await useCase.execute({ ...dto, condicion: 'USADO' });
      expect(usado.getError().code).toBe('CONDICION_USADO_NO_ADMITIDA');
      expect(recuperarDescartadas).not.toHaveBeenCalled();
      expect((await useCase.execute(dto)).isOk()).toBe(true);
    }
  });

  it('desenvuelve FalloOperacionDeUnidad como Result.fail y propaga lo inesperado', async () => {
    const duplicado = armar({
      recuperarDescartadas: async () => {
        throw new FalloOperacionDeUnidad(new SerialDuplicadoError('SN-1'));
      },
    });
    expect((await duplicado.useCase.execute(dto)).getError()).toBeInstanceOf(SerialDuplicadoError);

    const roto = armar({
      recuperarDescartadas: async () => {
        throw new Error('boom');
      },
    });
    await expect(roto.useCase.execute(dto)).rejects.toThrow('boom');
  });
});
