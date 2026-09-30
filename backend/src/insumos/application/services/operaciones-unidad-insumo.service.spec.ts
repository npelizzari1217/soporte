import { EventoUnidadInsumoEntity } from '../../domain/entities/evento-unidad-insumo.entity';
import { MovimientoInsumoEntity } from '../../domain/entities/movimiento-insumo.entity';
import { EstadoUnidadInsumo, UnidadInsumoEntity } from '../../domain/entities/unidad-insumo.entity';
import { MotivoAjusteRequeridoError } from '../../domain/errors/insumos.errors';
import {
  SerialDuplicadoError,
  SerialRequeridoError,
  UnidadNoAdmitidaError,
} from '../../domain/errors/unidades-insumo.errors';
import { InsumoNoEncontradoError } from '../../domain/errors/insumos.errors';
import { SeguimientoInsumo } from '../../domain/entities/unidad-insumo.entity';
import { OperacionesUnidadInsumo } from './operaciones-unidad-insumo.service';

const INSUMO = '11111111-1111-4111-8111-111111111111';

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
      const r2 = await ninguno.servicio.ingresar(INSUMO, [{ numeroSerie: 'A' }], {
        usuarioId: 'u',
        condicion: 'NUEVO',
        tipo: 'ENTRADA',
      });
      expect(r2.getError()).toBeInstanceOf(UnidadNoAdmitidaError);
      expect(ninguno.llamadas).toEqual([`L1:${INSUMO}`]);
    });

    it('toma L1 y L2 del insumo antes de la primera escritura', async () => {
      const t = armar({});
      await t.servicio.ingresar(INSUMO, [{ numeroSerie: 'A' }], {
        usuarioId: 'u',
        condicion: 'NUEVO',
        tipo: 'ENTRADA',
      });
      expect(t.llamadas.slice(0, 2)).toEqual([`L1:${INSUMO}`, `L2:${INSUMO}`]);
      expect(t.llamadas.findIndex((l) => l.startsWith('W:'))).toBe(2);
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
});
