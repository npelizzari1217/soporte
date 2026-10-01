import { describe, expect, it, vi } from 'vitest';
import { CambiarSeguimientoInsumoUseCase } from './cambiar-seguimiento-insumo.use-case';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { InsumoEntity } from '../../domain/entities/insumo.entity';
import type {
  EstadoUnidadInsumo,
  SeguimientoInsumo,
} from '../../domain/entities/unidad-insumo.entity';
import type { SumasPorCondicionYTipo } from '../../domain/entities/tipo-movimiento-insumo';
import { InsumoNoEncontradoError } from '../../domain/errors/insumos.errors';
import { SeguimientoNoModificableError } from '../../domain/errors/unidades-insumo.errors';
import { UnidadMedidaCambiadaError } from '../../domain/errors/unidades-medida.errors';

describe('CambiarSeguimientoInsumoUseCase', () => {
  const INSUMO_ID = 'ins-1';

  /** Sumas del libro con un saldo `NUEVO` de `entradas` (y nada más). */
  function sumas(entradas: number): SumasPorCondicionYTipo {
    const vacias = { ENTRADA: 0, SALIDA: 0, AJUSTE_POSITIVO: 0, AJUSTE_NEGATIVO: 0 };
    return { NUEVO: { ...vacias, ENTRADA: entradas }, USADO: { ...vacias } };
  }

  function buildInsumo(seguimiento: SeguimientoInsumo, unidadMedidaId = 'uni-1'): InsumoEntity {
    return InsumoEntity.create(
      {
        codigo: 'REP-0001',
        nombre: 'Disco',
        familiaId: 'fam-1',
        unidadMedidaId,
        seguimiento,
        stockMinimo: null,
        activo: true,
        codigosAlternativos: [],
        compatibilidad: [],
      },
      INSUMO_ID,
    );
  }

  interface Escenario {
    seguimiento?: SeguimientoInsumo;
    /** `unidad_medida_id` que devuelve la lectura con L1 (por default, la misma). */
    unidadConL1?: string;
    entera?: boolean;
    saldo?: number;
    porEstado?: Partial<Record<EstadoUnidadInsumo, number>>;
    insumo?: InsumoEntity | null;
  }

  function armar(e: Escenario = {}) {
    const seguimiento = e.seguimiento ?? 'NINGUNO';
    const llamadas: string[] = [];
    const registrar = <T>(nombre: string, valor: T) =>
      vi.fn(async () => {
        llamadas.push(nombre);
        return valor;
      });
    let vigente = seguimiento;
    const insumoRepo = {
      findById: vi.fn(async () => {
        llamadas.push('findById');
        return e.insumo === undefined ? buildInsumo(vigente) : e.insumo;
      }),
      bloquearParaCambioDeSeguimiento: registrar('L1', {
        seguimiento,
        unidadMedidaId: e.unidadConL1 ?? 'uni-1',
      }),
      cambiarSeguimiento: vi.fn(async (_id: string, valor: SeguimientoInsumo) => {
        llamadas.push('cambiarSeguimiento');
        vigente = valor;
      }),
    };
    const unidadMedidaRepo = { leerParaUso: registrar('L0', { entera: e.entera ?? true }) };
    const movimientoRepo = {
      bloquearStock: registrar('L2', undefined),
      sumByTipo: registrar('sumByTipo', sumas(e.saldo ?? 0)),
    };
    const unidadRepo = {
      contarPorEstado: registrar('contarPorEstado', {
        EN_DEPOSITO: 0,
        INSTALADA: 0,
        ENTREGADA: 0,
        DESCARTADA: 0,
        ...e.porEstado,
      }),
    };
    const txRunner: Pick<ITenantTransactionRunner, 'run'> = {
      run: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
    };
    const useCase = new CambiarSeguimientoInsumoUseCase(
      insumoRepo,
      unidadMedidaRepo,
      movimientoRepo,
      unidadRepo,
      txRunner,
    );
    return { useCase, insumoRepo, unidadMedidaRepo, movimientoRepo, unidadRepo, llamadas };
  }

  describe('NINGUNO -> SERIE', () => {
    it('activa con saldo cero y unidad entera, tomando L0, L1 y L2 en ese orden', async () => {
      const { useCase, insumoRepo, llamadas } = armar();

      const r = await useCase.execute({ insumoId: INSUMO_ID, seguimiento: 'SERIE' });

      expect(r.isOk()).toBe(true);
      expect(r.getValue().seguimiento).toBe('SERIE');
      expect(insumoRepo.cambiarSeguimiento).toHaveBeenCalledWith(INSUMO_ID, 'SERIE');
      const locks = llamadas.filter((l) => ['L0', 'L1', 'L2'].includes(l));
      expect(locks).toEqual(['L0', 'L1', 'L2']);
      // Los conteos se leen DESPUES de L2, sobre la instantanea nueva.
      expect(llamadas.indexOf('sumByTipo')).toBeGreaterThan(llamadas.indexOf('L2'));
    });

    it('rechaza con saldo distinto de cero, con el saldo en el motivo, y no escribe', async () => {
      const { useCase, insumoRepo } = armar({ saldo: 3 });

      const r = await useCase.execute({ insumoId: INSUMO_ID, seguimiento: 'SERIE' });

      expect(r.isFail()).toBe(true);
      expect(r.getError()).toBeInstanceOf(SeguimientoNoModificableError);
      expect(r.getError().message).toContain('saldo es 3');
      expect(insumoRepo.cambiarSeguimiento).not.toHaveBeenCalled();
    });

    it('rechaza con unidad de medida no entera y no escribe', async () => {
      const { useCase, insumoRepo } = armar({ entera: false });

      const r = await useCase.execute({ insumoId: INSUMO_ID, seguimiento: 'SERIE' });

      expect(r.getError()).toBeInstanceOf(SeguimientoNoModificableError);
      expect(r.getError().message).toContain('no es entera');
      expect(insumoRepo.cambiarSeguimiento).not.toHaveBeenCalled();
    });

    it('unidad cambiada entre la lectura sin lock y L1 => UnidadMedidaCambiadaError, sin L0 nuevo ni L2', async () => {
      const { useCase, unidadMedidaRepo, movimientoRepo, insumoRepo } = armar({
        unidadConL1: 'uni-2',
      });

      const r = await useCase.execute({ insumoId: INSUMO_ID, seguimiento: 'SERIE' });

      expect(r.isFail()).toBe(true);
      expect(r.getError()).toBeInstanceOf(UnidadMedidaCambiadaError);
      // Un solo L0 (sobre la unidad vieja): tomar otro sobre la nueva seria L0 despues de L1.
      expect(unidadMedidaRepo.leerParaUso).toHaveBeenCalledTimes(1);
      expect(unidadMedidaRepo.leerParaUso).toHaveBeenCalledWith('uni-1');
      expect(movimientoRepo.bloquearStock).not.toHaveBeenCalled();
      expect(insumoRepo.cambiarSeguimiento).not.toHaveBeenCalled();
    });
  });

  describe('SERIE -> NINGUNO', () => {
    it('vuelve con cero unidades vivas, sin tomar L0, con L1 antes que L2', async () => {
      const { useCase, insumoRepo, unidadMedidaRepo, llamadas } = armar({ seguimiento: 'SERIE' });

      const r = await useCase.execute({ insumoId: INSUMO_ID, seguimiento: 'NINGUNO' });

      expect(r.isOk()).toBe(true);
      expect(r.getValue().seguimiento).toBe('NINGUNO');
      expect(insumoRepo.cambiarSeguimiento).toHaveBeenCalledWith(INSUMO_ID, 'NINGUNO');
      expect(unidadMedidaRepo.leerParaUso).not.toHaveBeenCalled();
      expect(llamadas.filter((l) => ['L1', 'L2'].includes(l))).toEqual(['L1', 'L2']);
    });

    it.each([
      ['en el deposito', { EN_DEPOSITO: 2 }],
      ['instaladas', { INSTALADA: 1 }],
    ])('rechaza con unidades %s y no escribe', async (_nombre, porEstado) => {
      const { useCase, insumoRepo } = armar({ seguimiento: 'SERIE', porEstado });

      const r = await useCase.execute({ insumoId: INSUMO_ID, seguimiento: 'NINGUNO' });

      expect(r.getError()).toBeInstanceOf(SeguimientoNoModificableError);
      expect(insumoRepo.cambiarSeguimiento).not.toHaveBeenCalled();
    });

    it('con solo unidades entregadas o descartadas vuelve a NINGUNO', async () => {
      const { useCase, insumoRepo } = armar({
        seguimiento: 'SERIE',
        porEstado: { ENTREGADA: 4, DESCARTADA: 2 },
      });

      const r = await useCase.execute({ insumoId: INSUMO_ID, seguimiento: 'NINGUNO' });

      expect(r.isOk()).toBe(true);
      expect(insumoRepo.cambiarSeguimiento).toHaveBeenCalledWith(INSUMO_ID, 'NINGUNO');
    });
  });

  it('pedir el seguimiento que ya tiene es un no-op: no escribe', async () => {
    const { useCase, insumoRepo } = armar({ seguimiento: 'SERIE' });

    const r = await useCase.execute({ insumoId: INSUMO_ID, seguimiento: 'SERIE' });

    expect(r.isOk()).toBe(true);
    expect(insumoRepo.cambiarSeguimiento).not.toHaveBeenCalled();
  });

  it('insumo inexistente => InsumoNoEncontradoError sin tomar ningun lock', async () => {
    const { useCase, insumoRepo, unidadMedidaRepo } = armar({ insumo: null });

    const r = await useCase.execute({ insumoId: INSUMO_ID, seguimiento: 'SERIE' });

    expect(r.getError()).toBeInstanceOf(InsumoNoEncontradoError);
    expect(unidadMedidaRepo.leerParaUso).not.toHaveBeenCalled();
    expect(insumoRepo.bloquearParaCambioDeSeguimiento).not.toHaveBeenCalled();
  });
});
