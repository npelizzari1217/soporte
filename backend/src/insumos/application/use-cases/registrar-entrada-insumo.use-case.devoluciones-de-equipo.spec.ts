import { describe, expect, it, vi } from 'vitest';
import { Result } from '../../../shared/domain/result';
import { unstubbed } from '../../../testing/mocks';
import { FamiliaInsumoEntity } from '../../domain/entities/familia-insumo.entity';
import { InsumoEntity } from '../../domain/entities/insumo.entity';
import { MovimientoInsumoEntity } from '../../domain/entities/movimiento-insumo.entity';
import { SeguimientoInsumo, UnidadInsumoEntity } from '../../domain/entities/unidad-insumo.entity';
import { DevolucionConPiezasProblematicasError } from '../../domain/errors/unidades-insumo.errors';
import { IFamiliaInsumoRepository } from '../../domain/ports/i-familia-insumo.repository';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';
import { IMovimientoInsumoRepository } from '../../domain/ports/i-movimiento-insumo.repository';
import { familiaFake } from '../../testing/familia-repo-fake';
import { txRunnerFake } from '../../testing/tx-runner-fake';
import {
  OperacionesUnidadInsumo,
  UnidadConMovimiento,
} from '../services/operaciones-unidad-insumo.service';
import {
  PiezaDeEquipoADevolver,
  RegistrarEntradaInsumoUseCase,
} from './registrar-entrada-insumo.use-case';

const LEYENDA = 'Baja del equipo «PC-1» — Vejez';

interface InsumoFixture {
  seguimiento?: SeguimientoInsumo;
  activo?: boolean;
  dadoDeBaja?: boolean;
  familia?: { esRepuesto?: boolean; activo?: boolean; dadaDeBaja?: boolean; inexistente?: boolean };
}

/**
 * Arma el caso de uso con fakes `Pick` tipados y un registro común de llamadas,
 * para poder afirmar el ORDEN de lectura con lock, la pasada de `operaciones`
 * y las ENTRADAs.
 */
function armar(insumos: Record<string, InsumoFixture>, existentes: string[] = []) {
  const llamadas: string[] = [];
  const entradas: MovimientoInsumoEntity[] = [];

  const entidades = new Map<string, InsumoEntity>();
  const familias = new Map<string, FamiliaInsumoEntity | null>();
  for (const [id, f] of Object.entries(insumos)) {
    const props = {
      codigo: `C-${id}`,
      nombre: `Insumo ${id}`,
      familiaId: `fam-${id}`,
      unidadMedidaId: 'uni-1',
      stockMinimo: null,
      activo: f.activo ?? true,
      seguimiento: f.seguimiento ?? 'NINGUNO',
      codigosAlternativos: [],
      compatibilidad: [],
    };
    entidades.set(
      id,
      f.dadoDeBaja === true
        ? InsumoEntity.reconstitute(
            props,
            id,
            new Date('2026-01-01T00:00:00Z'),
            new Date('2026-01-01T00:00:00Z'),
            new Date('2026-02-01T00:00:00Z'),
          )
        : InsumoEntity.create(props, id),
    );
    familias.set(`fam-${id}`, f.familia?.inexistente === true ? null : familiaFake(f.familia));
  }

  const insumoRepo: Pick<IInsumoRepository, 'findById' | 'leerSeguimientoParaMovimiento'> = {
    findById: vi.fn(async (id: string) => entidades.get(id) ?? null),
    leerSeguimientoParaMovimiento: vi.fn(async (id: string) => {
      llamadas.push(`L1:${id}`);
      const insumo = entidades.get(id);
      return insumo === undefined ? null : insumo.seguimiento;
    }),
  };
  const familiaRepo: Pick<IFamiliaInsumoRepository, 'findById'> = {
    findById: vi.fn(async (id: string) => familias.get(id) ?? null),
  };
  const movimientoRepo: Pick<IMovimientoInsumoRepository, 'insert'> = {
    insert: vi.fn(async (movimiento: MovimientoInsumoEntity) => {
      llamadas.push(`ENTRADA:${movimiento.insumoId}`);
      entradas.push(movimiento);
      return movimiento;
    }),
  };

  const devolverDesdeEquipo = vi.fn<OperacionesUnidadInsumo['devolverDesdeEquipo']>(
    async (conUnidad, legados, o, causasPrevias = []) => {
      llamadas.push('devolverDesdeEquipo');
      if (causasPrevias.length > 0) {
        return Result.fail(new DevolucionConPiezasProblematicasError(causasPrevias));
      }
      const devueltas = new Map<string, UnidadConMovimiento>();
      for (const pieza of [...conUnidad, ...legados]) {
        const unidad = UnidadInsumoEntity.crearInstalada({
          insumoId: pieza.insumoId ?? 'x',
          condicion: 'USADO',
          numeroSerie: `S-${pieza.componenteId}`,
          equipoId: pieza.equipoId,
        }).getValue();
        const movimiento = MovimientoInsumoEntity.create({
          insumoId: pieza.insumoId ?? 'x',
          tipo: 'ENTRADA',
          condicion: 'USADO',
          cantidad: 1,
          usuarioId: o.usuarioId,
          motivo: o.motivo,
          equipoId: pieza.equipoId,
        }).getValue();
        devueltas.set(pieza.componenteId, { unidad, movimiento });
      }
      return Result.ok(devueltas);
    },
  );
  const serialesExistentes = vi.fn<OperacionesUnidadInsumo['serialesExistentes']>(
    async () => new Set(existentes),
  );
  const txRunner = txRunnerFake();
  const useCase = new RegistrarEntradaInsumoUseCase(
    insumoRepo,
    movimientoRepo,
    familiaRepo,
    txRunner,
    {
      ingresar: unstubbed('ingresar'),
      devolverAlDeposito: unstubbed('devolverAlDeposito'),
      devolverDesdeEquipo,
      serialesExistentes,
    },
  );
  return { useCase, llamadas, entradas, devolverDesdeEquipo, serialesExistentes, txRunner };
}

function pieza(
  componenteId: string,
  insumoId: string | null,
  extra: Partial<PiezaDeEquipoADevolver> = {},
): PiezaDeEquipoADevolver {
  return { componenteId, insumoId, unidadId: null, numeroSerie: null, ...extra };
}

const base = { equipoId: 'eq-1', usuarioId: 'usr-1', motivo: LEYENDA };

describe('RegistrarEntradaInsumoUseCase.registrarDevolucionesDeEquipo', () => {
  it('asienta una ENTRADA USADO por pieza NINGUNO, con el equipo y la leyenda, aunque compartan insumo', async () => {
    const { useCase, entradas } = armar({ 'ins-a': {} });

    const result = await useCase.registrarDevolucionesDeEquipo({
      ...base,
      piezas: [pieza('c-1', 'ins-a'), pieza('c-2', 'ins-a')],
    });

    expect(result.isOk()).toBe(true);
    expect(entradas).toHaveLength(2);
    for (const entrada of entradas) {
      expect(entrada.tipo).toBe('ENTRADA');
      expect(entrada.condicion).toBe('USADO');
      expect(entrada.cantidad).toBe(1);
      expect(entrada.equipoId).toBe('eq-1');
      expect(entrada.motivo).toBe(LEYENDA);
    }
    const movimientos = result.getValue();
    expect([...movimientos.keys()]).toEqual(['c-1', 'c-2']);
    expect(movimientos.get('c-1')).toBe(entradas[0].id);
    expect(movimientos.get('c-2')).toBe(entradas[1].id);
  });

  it('admite el insumo deshabilitado y la familia dada de baja o deshabilitada', async () => {
    const { useCase, entradas } = armar({
      'ins-a': { activo: false },
      'ins-b': { familia: { activo: false } },
      'ins-c': { familia: { dadaDeBaja: true } },
    });

    const result = await useCase.registrarDevolucionesDeEquipo({
      ...base,
      piezas: [pieza('c-1', 'ins-a'), pieza('c-2', 'ins-b'), pieza('c-3', 'ins-c')],
    });

    expect(result.isOk()).toBe(true);
    expect(entradas).toHaveLength(3);
  });

  it('una pieza sin insumo no toca stock y no figura en el resultado', async () => {
    const { useCase, entradas, devolverDesdeEquipo } = armar({ 'ins-a': {} });

    const result = await useCase.registrarDevolucionesDeEquipo({
      ...base,
      piezas: [pieza('c-1', null), pieza('c-2', 'ins-a')],
    });

    expect([...result.getValue().keys()]).toEqual(['c-2']);
    expect(entradas).toHaveLength(1);
    expect(devolverDesdeEquipo.mock.calls[0][0]).toEqual([]);
  });

  it('un insumo borrado es la causa INSUMO_BORRADO y no se escribe nada', async () => {
    const { useCase, entradas } = armar({ 'ins-a': { dadoDeBaja: true }, 'ins-b': {} });

    const result = await useCase.registrarDevolucionesDeEquipo({
      ...base,
      piezas: [pieza('c-1', 'ins-a'), pieza('c-2', 'ins-b')],
    });

    expect(result.isFail()).toBe(true);
    const error = result.getError();
    expect(error).toBeInstanceOf(DevolucionConPiezasProblematicasError);
    expect((error as DevolucionConPiezasProblematicasError).piezas).toEqual([
      { componenteId: 'c-1', insumoId: 'ins-a', causa: 'INSUMO_BORRADO' },
    ]);
    expect(entradas).toHaveLength(0);
  });

  it('junta TODAS las causas sin cortar en la primera', async () => {
    const { useCase, devolverDesdeEquipo, entradas } = armar({
      'ins-a': { dadoDeBaja: true },
      'ins-b': { seguimiento: 'SERIE' },
      'ins-c': { familia: { esRepuesto: false } },
    });

    const result = await useCase.registrarDevolucionesDeEquipo({
      ...base,
      piezas: [
        pieza('c-1', 'ins-a'),
        pieza('c-2', 'ins-b', { numeroSerie: '   ' }),
        pieza('c-3', 'ins-c'),
      ],
    });

    const piezas = (result.getError() as DevolucionConPiezasProblematicasError).piezas;
    expect(piezas.map((p) => `${p.componenteId}:${p.causa}`)).toEqual([
      'c-1:INSUMO_BORRADO',
      'c-2:SERIAL_REQUERIDO',
      'c-3:FAMILIA_NO_REPUESTO',
    ]);
    // Las causas viajan a `devolverDesdeEquipo` para unirse con SERIAL_DUPLICADO.
    expect(devolverDesdeEquipo.mock.calls[0][3]).toHaveLength(3);
    expect(entradas).toHaveLength(0);
  });

  it('detecta el serial repetido en el lote para el mismo insumo SERIE', async () => {
    const { useCase } = armar({ 'ins-b': { seguimiento: 'SERIE' } });

    const result = await useCase.registrarDevolucionesDeEquipo({
      ...base,
      piezas: [
        pieza('c-1', 'ins-b', { numeroSerie: 'ab-1' }),
        pieza('c-2', 'ins-b', { numeroSerie: ' AB-1 ' }),
      ],
    });

    const piezas = (result.getError() as DevolucionConPiezasProblematicasError).piezas;
    expect(piezas.map((p) => p.causa)).toEqual(['SERIAL_REPETIDO', 'SERIAL_REPETIDO']);
  });

  it('delega la unidad y el legado SERIE en devolverDesdeEquipo y devuelve sus movimientos', async () => {
    const { useCase, devolverDesdeEquipo, entradas } = armar({
      'ins-a': { seguimiento: 'SERIE' },
      'ins-b': {},
    });

    const result = await useCase.registrarDevolucionesDeEquipo({
      ...base,
      piezas: [
        pieza('c-1', 'ins-a', { unidadId: 'un-1' }),
        pieza('c-2', 'ins-a', { numeroSerie: ' SN-2 ' }),
        pieza('c-3', 'ins-b'),
      ],
    });

    const [conUnidad, legados, contexto] = devolverDesdeEquipo.mock.calls[0];
    expect(conUnidad).toEqual([
      { unidadId: 'un-1', equipoId: 'eq-1', componenteId: 'c-1', insumoId: 'ins-a' },
    ]);
    expect(legados).toEqual([
      { componenteId: 'c-2', insumoId: 'ins-a', equipoId: 'eq-1', numeroSerie: 'SN-2' },
    ]);
    expect(contexto).toEqual({ usuarioId: 'usr-1', motivo: LEYENDA });
    expect(entradas).toHaveLength(1);
    expect([...result.getValue().keys()].sort()).toEqual(['c-1', 'c-2', 'c-3']);
  });

  it('toma L1 de TODOS los insumos en orden de id, antes de L2 y de cualquier ENTRADA; los NINGUNO no toman L2', async () => {
    const { useCase, llamadas } = armar({
      'ins-c': {},
      'ins-a': { seguimiento: 'SERIE' },
      'ins-b': {},
    });

    await useCase.registrarDevolucionesDeEquipo({
      ...base,
      piezas: [
        pieza('c-1', 'ins-c'),
        pieza('c-2', 'ins-a', { unidadId: 'un-1' }),
        pieza('c-3', 'ins-b'),
        pieza('c-4', 'ins-c'),
      ],
    });

    expect(llamadas).toEqual([
      'L1:ins-a',
      'L1:ins-b',
      'L1:ins-c',
      'devolverDesdeEquipo',
      'ENTRADA:ins-c',
      'ENTRADA:ins-b',
      'ENTRADA:ins-c',
    ]);
  });

  it('con un lote solo NINGUNO no hay unidades ni legados: devolverDesdeEquipo recibe listas vacías', async () => {
    const { useCase, devolverDesdeEquipo } = armar({ 'ins-a': {} });

    await useCase.registrarDevolucionesDeEquipo({ ...base, piezas: [pieza('c-1', 'ins-a')] });

    expect(devolverDesdeEquipo.mock.calls[0].slice(0, 2)).toEqual([[], []]);
  });
});

describe('RegistrarEntradaInsumoUseCase.diagnosticarDevolucionesDeEquipo', () => {
  it('no abre transaccion ni toma ningun lock', async () => {
    const { useCase, llamadas, txRunner } = armar({ 'ins-a': {} });

    const causas = await useCase.diagnosticarDevolucionesDeEquipo([pieza('c-1', 'ins-a')]);

    expect(causas).toEqual([]);
    expect(txRunner.abiertas).toBe(0);
    expect(llamadas).toEqual([]);
  });

  it('lista las causas de TODAS las piezas, incluida SERIAL_DUPLICADO sin lock', async () => {
    const { useCase, serialesExistentes } = armar(
      {
        'ins-a': { dadoDeBaja: true },
        'ins-b': { seguimiento: 'SERIE' },
        'ins-c': { familia: { esRepuesto: false } },
      },
      ['DUP-1'],
    );

    const causas = await useCase.diagnosticarDevolucionesDeEquipo([
      pieza('c-1', 'ins-a'),
      pieza('c-2', 'ins-b', { numeroSerie: 'dup-1' }),
      pieza('c-3', 'ins-c'),
      pieza('c-4', 'ins-b', { numeroSerie: 'libre' }),
    ]);

    expect(causas.map((c) => `${c.componenteId}:${c.causa}`)).toEqual([
      'c-1:INSUMO_BORRADO',
      'c-3:FAMILIA_NO_REPUESTO',
      'c-2:SERIAL_DUPLICADO',
    ]);
    expect(serialesExistentes).toHaveBeenCalledWith('ins-b', ['DUP-1', 'LIBRE']);
  });

  it('un insumo inexistente es INSUMO_BORRADO y no consulta seriales de piezas con otra causa', async () => {
    const { useCase, serialesExistentes } = armar({ 'ins-b': { seguimiento: 'SERIE' } });

    const causas = await useCase.diagnosticarDevolucionesDeEquipo([
      pieza('c-1', 'ins-x'),
      pieza('c-2', 'ins-b', { unidadId: 'un-1' }),
    ]);

    expect(causas).toEqual([{ componenteId: 'c-1', insumoId: 'ins-x', causa: 'INSUMO_BORRADO' }]);
    expect(serialesExistentes).not.toHaveBeenCalled();
  });
});
