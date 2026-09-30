import { describe, expect, it, vi } from 'vitest';
import { Result } from '../../../shared/domain/result';
import { InsumoEntity } from '../../domain/entities/insumo.entity';
import { MovimientoInsumoEntity } from '../../domain/entities/movimiento-insumo.entity';
import { UnidadInsumoEntity } from '../../domain/entities/unidad-insumo.entity';
import { FalloOperacionDeUnidad } from '../../domain/errors/fallo-operacion-de-unidad';
import {
  SeguimientoNoModificableError,
  SerialDuplicadoError,
  UnidadNoDisponibleError,
  UnidadNoEncontradaError,
} from '../../domain/errors/unidades-insumo.errors';
import { familiaRepoFake } from '../../testing/familia-repo-fake';
import { txRunnerFake } from '../../testing/tx-runner-fake';
import { RegistrarAjusteInsumoUseCase } from './registrar-ajuste-insumo.use-case';
import { RegistrarEntradaInsumoUseCase } from './registrar-entrada-insumo.use-case';
import type { OperacionesUnidadInsumo } from '../services/operaciones-unidad-insumo.service';
import { DevolverEntregaUseCase } from './devolver-entrega.use-case';

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
      estado: 'ENTREGADA',
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
    devolverEntregas?: OperacionesUnidadInsumo['devolverEntregas'];
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
  const devolverEntregas = vi.fn<OperacionesUnidadInsumo['devolverEntregas']>(
    opciones.devolverEntregas ??
      (async (_i, _u, o) =>
        Result.ok([{ unidad: unidad(), movimiento: movimientoEntrada(o.condicion) }])),
  );
  const useCase = new DevolverEntregaUseCase(insumoRepo, unidadRepo, familiaRepo, tx, {
    devolverEntregas,
  });
  return { useCase, insumoRepo, familiaRepo, tx, devolverEntregas };
}

const dto = { insumoId: 'ins-1', unidadId: 'u-1', condicion: 'NUEVO' as const, usuarioId: 'usr-1' };

describe('DevolverEntregaUseCase', () => {
  it('devuelve NUEVO dentro de UNA transacción, con L1 leído antes de delegar', async () => {
    const { useCase, tx, insumoRepo, devolverEntregas } = armar();

    const r = await useCase.execute({ ...dto, motivo: 'No se usó' });

    expect(r.isOk()).toBe(true);
    expect(r.getValue()).toMatchObject({ tipo: 'ENTRADA', cantidad: 1, condicion: 'NUEVO' });
    expect(tx.abiertas).toBe(1);
    expect(devolverEntregas).toHaveBeenCalledWith('ins-1', ['u-1'], {
      usuarioId: 'usr-1',
      motivo: 'No se usó',
      condicion: 'NUEVO',
    });
    expect(insumoRepo.leerSeguimientoParaMovimiento.mock.invocationCallOrder[0]).toBeLessThan(
      devolverEntregas.mock.invocationCallOrder[0],
    );
  });

  it('devuelve USADO cuando la familia es de repuestos', async () => {
    const { useCase, devolverEntregas } = armar();

    const r = await useCase.execute({ ...dto, condicion: 'USADO' });

    expect(r.getValue().condicion).toBe('USADO');
    expect(devolverEntregas).toHaveBeenCalledWith('ins-1', ['u-1'], {
      usuarioId: 'usr-1',
      motivo: null,
      condicion: 'USADO',
    });
  });

  it('propaga la unidad no entregada sin escribir nada', async () => {
    const { useCase } = armar({
      devolverEntregas: async () =>
        Result.fail(new UnidadNoDisponibleError('u-1', 'no está entregada.')),
    });
    const r = await useCase.execute(dto);
    expect(r.getError()).toBeInstanceOf(UnidadNoDisponibleError);
  });

  it('un insumo NINGUNO lo rechaza el servicio con SeguimientoNoModificableError', async () => {
    const { useCase } = armar({
      seguimiento: 'NINGUNO',
      devolverEntregas: async () => Result.fail(new SeguimientoNoModificableError('x')),
    });
    const r = await useCase.execute(dto);
    expect(r.getError()).toBeInstanceOf(SeguimientoNoModificableError);
  });

  it('una unidad inexistente o de otro insumo es UnidadNoEncontradaError y no delega', async () => {
    for (const unidadDeInsumo of [null, 'ins-otro']) {
      const { useCase, devolverEntregas } = armar({ unidadDeInsumo });
      const r = await useCase.execute(dto);
      expect(r.getError()).toBeInstanceOf(UnidadNoEncontradaError);
      expect(devolverEntregas).not.toHaveBeenCalled();
    }
  });

  it('un insumo inexistente o dado de baja se rechaza', async () => {
    for (const insumo of [null, insumoDadoDeBaja()]) {
      const { useCase, devolverEntregas } = armar({ insumo });
      const r = await useCase.execute(dto);
      expect(r.getError().code).toBe('INSUMO_NO_ENCONTRADO');
      expect(devolverEntregas).not.toHaveBeenCalled();
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
      const { useCase, devolverEntregas } = armar({ familia });
      const usado = await useCase.execute({ ...dto, condicion: 'USADO' });
      expect(usado.getError().code).toBe('CONDICION_USADO_NO_ADMITIDA');
      expect(devolverEntregas).not.toHaveBeenCalled();
      expect((await useCase.execute(dto)).isOk()).toBe(true);
    }
  });

  it('desenvuelve FalloOperacionDeUnidad como Result.fail y propaga lo inesperado', async () => {
    const duplicado = armar({
      devolverEntregas: async () => {
        throw new FalloOperacionDeUnidad(new SerialDuplicadoError('SN-1'));
      },
    });
    expect((await duplicado.useCase.execute(dto)).getError()).toBeInstanceOf(SerialDuplicadoError);

    const roto = armar({
      devolverEntregas: async () => {
        throw new Error('boom');
      },
    });
    await expect(roto.useCase.execute(dto)).rejects.toThrow('boom');
  });
});

/**
 * La exención de G2 vive SOLO en `DevolverEntregaUseCase`: los mismos casos que
 * ese caso de uso admite siguen rechazados en la entrada y el ajuste manuales.
 */
describe('la exención de G2 no la reciben la entrada ni el ajuste manuales', () => {
  const insumoRepo = (insumo: InsumoEntity) => ({
    findById: vi.fn().mockResolvedValue(insumo),
    leerSeguimientoParaMovimiento: vi.fn().mockResolvedValue('SERIE'),
  });
  const movimientoRepo = { insert: vi.fn(), lockAndSumByTipo: vi.fn() };
  const operaciones = { ingresar: vi.fn(), devolverAlDeposito: vi.fn(), sacarDelDeposito: vi.fn() };

  it('la entrada manual rechaza el insumo deshabilitado y USADO con la familia no vigente', async () => {
    const entrada = (insumo: InsumoEntity, familia: Parameters<typeof familiaRepoFake>[0]) =>
      new RegistrarEntradaInsumoUseCase(
        insumoRepo(insumo) as never,
        movimientoRepo as never,
        familiaRepoFake(familia),
        txRunnerFake(),
        operaciones as never,
      );
    const base = { insumoId: 'ins-1', cantidad: 1, usuarioId: 'usr-1' };

    const deshabilitado = await entrada(insumoDeshabilitado(), {}).execute(base);
    const familiaBaja = await entrada(insumoVigente(), { activo: false }).execute({
      ...base,
      condicion: 'USADO',
    });

    expect(deshabilitado.getError().code).toBe('INSUMO_DESHABILITADO');
    expect(familiaBaja.getError().code).toBe('CONDICION_USADO_NO_ADMITIDA');
  });

  it('el ajuste positivo manual rechaza USADO con la familia no vigente', async () => {
    const ajuste = new RegistrarAjusteInsumoUseCase(
      insumoRepo(insumoVigente()) as never,
      movimientoRepo as never,
      txRunnerFake(),
      familiaRepoFake({ dadaDeBaja: true }),
      operaciones as never,
    );

    const r = await ajuste.execute({
      insumoId: 'ins-1',
      tipo: 'AJUSTE_POSITIVO',
      cantidad: 1,
      motivo: 'Conteo',
      condicion: 'USADO',
      usuarioId: 'usr-1',
    });

    expect(r.getError().code).toBe('CONDICION_USADO_NO_ADMITIDA');
  });
});
