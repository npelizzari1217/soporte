import { Result } from '../../../shared/domain/result';
import { EventoUnidadInsumoEntity } from '../../domain/entities/evento-unidad-insumo.entity';
import { MovimientoInsumoEntity } from '../../domain/entities/movimiento-insumo.entity';
import { EstadoUnidadInsumo, UnidadInsumoEntity } from '../../domain/entities/unidad-insumo.entity';
import { MotivoAjusteRequeridoError } from '../../domain/errors/insumos.errors';
import {
  SerialDuplicadoError,
  SerialRequeridoError,
  UnidadNoAdmitidaError,
  UnidadNoDisponibleError,
  UnidadNoEncontradaError,
} from '../../domain/errors/unidades-insumo.errors';
import { InsumoNoEncontradoError } from '../../domain/errors/insumos.errors';
import { SeguimientoInsumo } from '../../domain/entities/unidad-insumo.entity';
import { OperacionesUnidadInsumo } from './operaciones-unidad-insumo.service';

const INSUMO = '11111111-1111-4111-8111-111111111111';
const OTRO_INSUMO = '22222222-2222-4222-8222-222222222222';
const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';
const U3 = '00000000-0000-4000-8000-000000000003';

/** Fakes que registran el orden de cada llamada para afirmar "nunca escribir antes de validar". */
function armar(opciones: {
  seguimiento?: SeguimientoInsumo | null;
  unidades?: UnidadInsumoEntity[];
}) {
  const llamadas: string[] = [];
  const escritas: Array<{ id: string; estado: EstadoUnidadInsumo }> = [];
  const movimientos: MovimientoInsumoEntity[] = [];
  const eventos: EventoUnidadInsumoEntity[] = [];
  const insertadas: UnidadInsumoEntity[] = [];
  const unidades = opciones.unidades ?? [];
  const servicio = new OperacionesUnidadInsumo(
    {
      leerSeguimientoParaMovimiento: async (id) => {
        llamadas.push(`L1:${id}`);
        return opciones.seguimiento === undefined ? 'SERIE' : opciones.seguimiento;
      },
    },
    {
      bloquearStock: async (id) => {
        llamadas.push(`L2:${id}`);
      },
      insert: async (m) => {
        llamadas.push('W:movimiento');
        movimientos.push(m);
        return m;
      },
    },
    {
      bloquearPorIds: async (ids) => {
        llamadas.push(`L3:${ids.join(',')}`);
        return unidades.filter((u) => ids.includes(u.id));
      },
      insertar: async (u) => {
        llamadas.push('W:insertar');
        insertadas.push(u);
      },
      guardarConEstadoEsperado: async (u, esperado) => {
        llamadas.push(`W:cas:${esperado}`);
        escritas.push({ id: u.id, estado: u.estado });
      },
    },
    {
      insert: async (e) => {
        llamadas.push('W:evento');
        eventos.push(e);
      },
    },
  );
  const escribio = () => llamadas.some((l) => l.startsWith('W:'));
  return { servicio, llamadas, escritas, movimientos, eventos, insertadas, escribio };
}

function unidad(
  id: string,
  over: { serial?: string | null; insumo?: string; condicion?: 'NUEVO' | 'USADO' } = {},
): UnidadInsumoEntity {
  return UnidadInsumoEntity.crearEnDeposito(
    {
      insumoId: over.insumo ?? INSUMO,
      condicion: over.condicion ?? 'NUEVO',
      numeroSerie: over.serial === undefined ? `SN-${id.slice(-1)}` : over.serial,
    },
    id,
  ).getValue();
}

describe('OperacionesUnidadInsumo', () => {
  describe('contrato común', () => {
    it('rechaza un insumo inexistente y uno que no es SERIE, sin tomar más locks ni escribir', async () => {
      const inexistente = armar({ seguimiento: null });
      const r1 = await inexistente.servicio.ingresar(INSUMO, [{ numeroSerie: 'A' }], {
        usuarioId: 'u',
        condicion: 'NUEVO',
        tipo: 'ENTRADA',
      });
      expect(r1.getError()).toBeInstanceOf(InsumoNoEncontradoError);
      expect(inexistente.llamadas).toEqual([`L1:${INSUMO}`]);

      const ninguno = armar({ seguimiento: 'NINGUNO' });
      const r2 = await ninguno.servicio.sacarDelDeposito(INSUMO, [U1], {
        usuarioId: 'u',
        tipo: 'SALIDA',
      });
      expect(r2.getError()).toBeInstanceOf(UnidadNoAdmitidaError);
      expect(ninguno.llamadas).toEqual([`L1:${INSUMO}`]);
    });

    it('toma los locks en el orden de ADR-12: L1, L2 y L3 (ids ordenados) antes de la primera escritura', async () => {
      const t = armar({ unidades: [unidad(U1), unidad(U2), unidad(U3)] });
      const r = await t.servicio.sacarDelDeposito(INSUMO, [U3, U1, U2], {
        usuarioId: 'u',
        tipo: 'SALIDA',
      });
      expect(r.isOk()).toBe(true);
      expect(t.llamadas.slice(0, 3)).toEqual([
        `L1:${INSUMO}`,
        `L2:${INSUMO}`,
        `L3:${U1},${U2},${U3}`,
      ]);
      expect(t.llamadas.findIndex((l) => l.startsWith('W:'))).toBe(3);
    });
  });

  describe('ingresar', () => {
    it('da de alta un lote de N: unidad, movimiento de cantidad 1 y evento INGRESO por pieza', async () => {
      const t = armar({});
      const r = await t.servicio.ingresar(
        INSUMO,
        [{ numeroSerie: ' ab 1 ' }, { numeroSerie: 'AB2' }, { numeroSerie: null }],
        { usuarioId: 'u', condicion: 'USADO', tipo: 'ENTRADA', itemCompraId: 'item-1' },
      );
      const lote = r.getValue();
      expect(lote).toHaveLength(3);
      expect(lote.map((x) => x.unidad.numeroSerieNormalizado)).toEqual(['AB1', 'AB2', null]);
      expect(t.insertadas).toHaveLength(3);
      expect(t.movimientos.every((m) => m.cantidad === 1 && m.condicion === 'USADO')).toBe(true);
      expect(t.movimientos.every((m) => m.tipo === 'ENTRADA' && m.itemCompraId === 'item-1')).toBe(
        true,
      );
      expect(t.movimientos.map((m) => m.unidadId)).toEqual(lote.map((x) => x.unidad.id));
      expect(t.eventos.map((e) => e.tipo)).toEqual(['INGRESO', 'INGRESO', 'INGRESO']);
      expect(t.eventos.map((e) => e.movimientoId)).toEqual(t.movimientos.map((m) => m.id));
    });

    it('un serial repetido dentro del lote se rechaza antes de escribir nada', async () => {
      const t = armar({});
      const r = await t.servicio.ingresar(
        INSUMO,
        [{ numeroSerie: 'A1' }, { numeroSerie: 'B2' }, { numeroSerie: 'a 1' }],
        { usuarioId: 'u', condicion: 'NUEVO', tipo: 'ENTRADA' },
      );
      expect(r.getError()).toBeInstanceOf(SerialDuplicadoError);
      expect(t.escribio()).toBe(false);
    });

    it('un serial vacío en la tercera pieza no deja escrita la primera', async () => {
      const t = armar({});
      const r = await t.servicio.ingresar(
        INSUMO,
        [{ numeroSerie: 'A1' }, { numeroSerie: 'B2' }, { numeroSerie: '   ' }],
        { usuarioId: 'u', condicion: 'NUEVO', tipo: 'ENTRADA' },
      );
      expect(r.getError()).toBeInstanceOf(SerialRequeridoError);
      expect(t.escribio()).toBe(false);
    });

    it('el ajuste positivo sin motivo falla en la segunda pieza sin haber escrito la primera', async () => {
      const t = armar({});
      const r = await t.servicio.ingresar(INSUMO, [{ numeroSerie: 'A1' }, { numeroSerie: 'B2' }], {
        usuarioId: 'u',
        condicion: 'NUEVO',
        tipo: 'AJUSTE_POSITIVO',
      });
      expect(r.getError()).toBeInstanceOf(MotivoAjusteRequeridoError);
      expect(t.escribio()).toBe(false);
    });

    it('el ajuste positivo con motivo registra el tipo y el motivo en movimiento y evento', async () => {
      const t = armar({});
      await t.servicio.ingresar(INSUMO, [{ numeroSerie: 'A1' }], {
        usuarioId: 'u',
        condicion: 'NUEVO',
        tipo: 'AJUSTE_POSITIVO',
        motivo: 'inventario',
        equipoId: 'eq-1',
      });
      expect(t.movimientos[0]).toMatchObject({
        tipo: 'AJUSTE_POSITIVO',
        motivo: 'inventario',
        equipoId: 'eq-1',
      });
      expect(t.eventos[0].motivo).toBe('inventario');
    });
  });

  describe('sacarDelDeposito', () => {
    it('SALIDA deja ENTREGADA con CAS desde EN_DEPOSITO, movimiento con destino y evento ENTREGA', async () => {
      const t = armar({ unidades: [unidad(U1), unidad(U2, { condicion: 'USADO' })] });
      const r = await t.servicio.sacarDelDeposito(INSUMO, [U1, U2], {
        usuarioId: 'u',
        tipo: 'SALIDA',
        equipoId: 'eq-1',
        sectorId: 'sec-1',
        motivo: 'entrega',
      });
      expect(r.getValue().map((x) => x.unidad.estado)).toEqual(['ENTREGADA', 'ENTREGADA']);
      expect(t.llamadas.filter((l) => l.startsWith('W:cas'))).toEqual([
        'W:cas:EN_DEPOSITO',
        'W:cas:EN_DEPOSITO',
      ]);
      expect(t.movimientos.map((m) => [m.tipo, m.condicion, m.unidadId])).toEqual([
        ['SALIDA', 'NUEVO', U1],
        ['SALIDA', 'USADO', U2],
      ]);
      expect(t.movimientos[0]).toMatchObject({
        equipoId: 'eq-1',
        sectorId: 'sec-1',
        motivo: 'entrega',
      });
      expect(t.eventos.map((e) => [e.tipo, e.movimientoId])).toEqual([
        ['ENTREGA', t.movimientos[0].id],
        ['ENTREGA', t.movimientos[1].id],
      ]);
    });

    it('un fallo en la unidad 2 no escribe la 1 (validar todo antes de escribir)', async () => {
      const t = armar({ unidades: [unidad(U1), unidad(U2, { serial: null })] });
      const r = await t.servicio.sacarDelDeposito(INSUMO, [U1, U2], {
        usuarioId: 'u',
        tipo: 'SALIDA',
      });
      expect(r.getError()).toBeInstanceOf(UnidadNoDisponibleError);
      expect(t.escribio()).toBe(false);
    });

    it('rechaza una unidad de otro insumo y una inexistente sin escribir', async () => {
      const ajena = armar({ unidades: [unidad(U1), unidad(U2, { insumo: OTRO_INSUMO })] });
      const r1 = await ajena.servicio.sacarDelDeposito(INSUMO, [U1, U2], {
        usuarioId: 'u',
        tipo: 'SALIDA',
      });
      expect(r1.getError()).toBeInstanceOf(UnidadNoAdmitidaError);
      expect(ajena.escribio()).toBe(false);

      const faltante = armar({ unidades: [unidad(U1)] });
      const r2 = await faltante.servicio.sacarDelDeposito(INSUMO, [U1, U2], {
        usuarioId: 'u',
        tipo: 'SALIDA',
      });
      expect(r2.getError()).toBeInstanceOf(UnidadNoEncontradaError);
      expect(faltante.escribio()).toBe(false);
    });

    it('rechaza una pendiente en SALIDA y la admite en AJUSTE_NEGATIVO (F1)', async () => {
      const salida = armar({ unidades: [unidad(U1, { serial: null })] });
      const r1 = await salida.servicio.sacarDelDeposito(INSUMO, [U1], {
        usuarioId: 'u',
        tipo: 'SALIDA',
      });
      expect(r1.getError()).toBeInstanceOf(UnidadNoDisponibleError);
      expect(salida.escribio()).toBe(false);

      const ajuste = armar({ unidades: [unidad(U1, { serial: null })] });
      const r2 = await ajuste.servicio.sacarDelDeposito(INSUMO, [U1], {
        usuarioId: 'u',
        tipo: 'AJUSTE_NEGATIVO',
        motivo: 'rota',
      });
      expect(r2.getValue()[0].unidad.estado).toBe('DESCARTADA');
      expect(ajuste.movimientos[0].tipo).toBe('AJUSTE_NEGATIVO');
      expect(ajuste.eventos[0].tipo).toBe('BAJA_DE_DEPOSITO');
      expect(ajuste.eventos[0].movimientoId).toBe(ajuste.movimientos[0].id);
    });

    it('AJUSTE_NEGATIVO sin motivo falla en la segunda unidad sin escribir la primera', async () => {
      const t = armar({ unidades: [unidad(U1), unidad(U2)] });
      const r = await t.servicio.sacarDelDeposito(INSUMO, [U1, U2], {
        usuarioId: 'u',
        tipo: 'AJUSTE_NEGATIVO',
      });
      expect(r.getError()).toBeInstanceOf(MotivoAjusteRequeridoError);
      expect(t.escribio()).toBe(false);
    });

    it('la condición pedida que no coincide da UnidadNoDisponibleError; si coincide, sigue', async () => {
      const t = armar({ unidades: [unidad(U1, { condicion: 'USADO' })] });
      const mal = await t.servicio.sacarDelDeposito(INSUMO, [U1], {
        usuarioId: 'u',
        tipo: 'SALIDA',
        condicion: 'NUEVO',
      });
      expect(mal.getError()).toBeInstanceOf(UnidadNoDisponibleError);
      expect(t.escribio()).toBe(false);

      const bien = await t.servicio.sacarDelDeposito(INSUMO, [U1], {
        usuarioId: 'u',
        tipo: 'SALIDA',
        condicion: 'USADO',
      });
      expect(bien.isOk()).toBe(true);
    });

    it('una unidad que no está EN_DEPOSITO o repetida en el lote se rechaza sin escribir', async () => {
      const entregada = unidad(U2);
      entregada.entregar();
      const t = armar({ unidades: [unidad(U1), entregada] });
      const r1 = await t.servicio.sacarDelDeposito(INSUMO, [U1, U2], {
        usuarioId: 'u',
        tipo: 'SALIDA',
      });
      expect(r1.getError()).toBeInstanceOf(UnidadNoDisponibleError);
      const r2 = await t.servicio.sacarDelDeposito(INSUMO, [U1, U1], {
        usuarioId: 'u',
        tipo: 'SALIDA',
      });
      expect(r2.getError()).toBeInstanceOf(UnidadNoDisponibleError);
      expect(t.escribio()).toBe(false);
    });

    it('un lote vacío no escribe y devuelve una lista vacía', async () => {
      const t = armar({});
      const r = await t.servicio.sacarDelDeposito(INSUMO, [], { usuarioId: 'u', tipo: 'SALIDA' });
      expect(r).toEqual(Result.ok([]));
      expect(t.escribio()).toBe(false);
    });
  });
});
