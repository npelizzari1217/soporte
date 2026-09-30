import { Result } from '../../../shared/domain/result';
import { EventoUnidadInsumoEntity } from '../../domain/entities/evento-unidad-insumo.entity';
import { MovimientoInsumoEntity } from '../../domain/entities/movimiento-insumo.entity';
import { EstadoUnidadInsumo, UnidadInsumoEntity } from '../../domain/entities/unidad-insumo.entity';
import { MotivoAjusteRequeridoError } from '../../domain/errors/insumos.errors';
import {
  MotivoCorreccionSerialInvalidoError,
  SeguimientoNoModificableError,
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
const EQ = 'eq-1';
const C1 = 'comp-1';
const C2 = 'comp-2';
const C3 = 'comp-3';
const item = (unidadId: string, componenteId: string, equipoId = EQ) => ({
  unidadId,
  equipoId,
  componenteId,
});

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
      findById: async (id) => {
        llamadas.push(`R:${id}`);
        return unidades.find((u) => u.id === id) ?? null;
      },
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
  describe('devolverEntregas', () => {
    function entregada(id: string, over: { condicion?: 'NUEVO' | 'USADO'; serial?: string } = {}) {
      const u = unidad(id, over);
      u.entregar();
      return u;
    }

    it('devuelve en la condición elegida: CAS desde ENTREGADA, ENTRADA de 1 y evento DEVOLUCION_DE_ENTREGA', async () => {
      const t = armar({ unidades: [entregada(U1), entregada(U2)] });
      const r = await t.servicio.devolverEntregas(INSUMO, [U1, U2], {
        usuarioId: 'u',
        condicion: 'USADO',
        motivo: 'volvió usada',
      });
      const lote = r.getValue();
      expect(lote.map((x) => [x.unidad.estado, x.unidad.condicion])).toEqual([
        ['EN_DEPOSITO', 'USADO'],
        ['EN_DEPOSITO', 'USADO'],
      ]);
      expect(t.llamadas.filter((l) => l.startsWith('W:cas'))).toEqual([
        'W:cas:ENTREGADA',
        'W:cas:ENTREGADA',
      ]);
      expect(t.movimientos.map((m) => [m.tipo, m.condicion, m.cantidad, m.unidadId])).toEqual([
        ['ENTRADA', 'USADO', 1, U1],
        ['ENTRADA', 'USADO', 1, U2],
      ]);
      expect(t.eventos.map((e) => [e.tipo, e.movimientoId])).toEqual([
        ['DEVOLUCION_DE_ENTREGA', t.movimientos[0].id],
        ['DEVOLUCION_DE_ENTREGA', t.movimientos[1].id],
      ]);
    });

    it('una pieza sin uso vuelve como NUEVO y conserva su serial', async () => {
      const t = armar({ unidades: [entregada(U1, { condicion: 'USADO' })] });
      const r = await t.servicio.devolverEntregas(INSUMO, [U1], {
        usuarioId: 'u',
        condicion: 'NUEVO',
      });
      expect(r.getValue()[0].unidad).toMatchObject({ condicion: 'NUEVO', numeroSerie: 'SN-1' });
    });

    it('respeta el orden de locks de ADR-12: L1, L2 y L3 antes de la primera escritura', async () => {
      const t = armar({ unidades: [entregada(U1), entregada(U2)] });
      await t.servicio.devolverEntregas(INSUMO, [U2, U1], { usuarioId: 'u', condicion: 'NUEVO' });
      expect(t.llamadas.slice(0, 3)).toEqual([`L1:${INSUMO}`, `L2:${INSUMO}`, `L3:${U1},${U2}`]);
    });

    it('rechaza una unidad que no está ENTREGADA sin escribir la otra', async () => {
      const t = armar({ unidades: [entregada(U1), unidad(U2)] });
      const r = await t.servicio.devolverEntregas(INSUMO, [U1, U2], {
        usuarioId: 'u',
        condicion: 'NUEVO',
      });
      expect(r.getError()).toBeInstanceOf(UnidadNoDisponibleError);
      expect(t.escribio()).toBe(false);
    });

    it('con el insumo en NINGUNO devuelve SeguimientoNoModificableError sin tomar más locks', async () => {
      const t = armar({ seguimiento: 'NINGUNO' });
      const r = await t.servicio.devolverEntregas(INSUMO, [U1], {
        usuarioId: 'u',
        condicion: 'NUEVO',
      });
      expect(r.getError()).toBeInstanceOf(SeguimientoNoModificableError);
      expect(t.llamadas).toEqual([`L1:${INSUMO}`]);
    });

    it('rechaza una unidad ajena, una inexistente y una repetida sin escribir', async () => {
      const ajena = unidad(U2, { insumo: OTRO_INSUMO });
      ajena.entregar();
      const casos: Array<[string[], UnidadInsumoEntity[], unknown]> = [
        [[U1, U2], [entregada(U1), ajena], UnidadNoAdmitidaError],
        [[U1, U3], [entregada(U1)], UnidadNoEncontradaError],
        [[U1, U1], [entregada(U1)], UnidadNoDisponibleError],
      ];
      for (const [ids, unidades, clase] of casos) {
        const t = armar({ unidades });
        const r = await t.servicio.devolverEntregas(INSUMO, ids, {
          usuarioId: 'u',
          condicion: 'NUEVO',
        });
        expect(r.getError()).toBeInstanceOf(clase);
        expect(t.escribio()).toBe(false);
      }
    });
  });

  describe('cargarSerial', () => {
    it('completa una pendiente: normaliza, CAS sin cambiar de estado y evento SERIAL_CARGADO sin movimiento ni motivo', async () => {
      const t = armar({ unidades: [unidad(U1, { serial: null })] });
      const r = await t.servicio.cargarSerial(U1, ' ab 1 ', { usuarioId: 'u', motivo: 'ignorado' });
      expect(r.getValue()).toMatchObject({
        numeroSerie: 'ab 1',
        numeroSerieNormalizado: 'AB1',
        estado: 'EN_DEPOSITO',
      });
      expect(t.llamadas).toEqual([
        `R:${U1}`,
        `L1:${INSUMO}`,
        `L2:${INSUMO}`,
        `L3:${U1}`,
        'W:cas:EN_DEPOSITO',
        'W:evento',
      ]);
      expect(t.movimientos).toHaveLength(0);
      expect(t.eventos[0]).toMatchObject({
        tipo: 'SERIAL_CARGADO',
        movimientoId: null,
        motivo: null,
        serialNuevo: 'ab 1',
        usuarioId: 'u',
      });
    });

    it('rechaza una unidad que ya tiene serial, una no EN_DEPOSITO y un serial vacío, sin escribir', async () => {
      const entregada = unidad(U2);
      entregada.entregar();
      const t = armar({ unidades: [unidad(U1), entregada, unidad(U3, { serial: null })] });
      const r1 = await t.servicio.cargarSerial(U1, 'X', { usuarioId: 'u' });
      const r2 = await t.servicio.cargarSerial(U2, 'X', { usuarioId: 'u' });
      const r3 = await t.servicio.cargarSerial(U3, '   ', { usuarioId: 'u' });
      expect(r1.getError()).toBeInstanceOf(UnidadNoDisponibleError);
      expect(r2.getError()).toBeInstanceOf(UnidadNoDisponibleError);
      expect(r3.getError()).toBeInstanceOf(SerialRequeridoError);
      expect(t.escribio()).toBe(false);
    });

    it('una unidad inexistente o de un insumo que no es SERIE se rechaza sin escribir', async () => {
      const t = armar({ unidades: [] });
      const r1 = await t.servicio.cargarSerial(U1, 'X', { usuarioId: 'u' });
      expect(r1.getError()).toBeInstanceOf(UnidadNoEncontradaError);

      const ninguno = armar({ seguimiento: 'NINGUNO', unidades: [unidad(U1, { serial: null })] });
      const r2 = await ninguno.servicio.cargarSerial(U1, 'X', { usuarioId: 'u' });
      expect(r2.getError()).toBeInstanceOf(UnidadNoAdmitidaError);
      expect(ninguno.escribio()).toBe(false);
    });
  });

  describe('corregirSerial', () => {
    it('corrige con motivo: evento CORRECCION_SERIAL con serial anterior, nuevo, motivo y usuario', async () => {
      const t = armar({ unidades: [unidad(U1, { serial: 'OLD-1' })] });
      const r = await t.servicio.corregirSerial(U1, ' new 1', {
        usuarioId: 'u-7',
        motivo: ' typo ',
      });
      expect(r.getValue()).toMatchObject({ numeroSerie: 'new 1', numeroSerieNormalizado: 'NEW1' });
      expect(t.llamadas.filter((l) => l.startsWith('W:'))).toEqual([
        'W:cas:EN_DEPOSITO',
        'W:evento',
      ]);
      expect(t.movimientos).toHaveLength(0);
      expect(t.eventos[0]).toMatchObject({
        tipo: 'CORRECCION_SERIAL',
        serialAnterior: 'OLD-1',
        serialNuevo: 'new 1',
        motivo: 'typo',
        usuarioId: 'u-7',
        movimientoId: null,
      });
    });

    it('sin motivo, con motivo en blanco o de más de 500 caracteres falla antes de tomar locks', async () => {
      const t = armar({ unidades: [unidad(U1)] });
      for (const motivo of [undefined, null, '   ', 'x'.repeat(501)]) {
        const r = await t.servicio.corregirSerial(U1, 'NUEVO', { usuarioId: 'u', motivo });
        expect(r.getError()).toBeInstanceOf(MotivoCorreccionSerialInvalidoError);
      }
      expect(t.llamadas).toEqual([]);
      const ok = await t.servicio.corregirSerial(U1, 'NUEVO', {
        usuarioId: 'u',
        motivo: 'x'.repeat(500),
      });
      expect(ok.isOk()).toBe(true);
    });

    it('rechaza una unidad INSTALADA, una pendiente y un serial vacío sin escribir', async () => {
      const instalada = unidad(U1);
      instalada.instalar('eq-1');
      const t = armar({
        unidades: [instalada, unidad(U2, { serial: null }), unidad(U3)],
      });
      const r1 = await t.servicio.corregirSerial(U1, 'X', { usuarioId: 'u', motivo: 'm' });
      const r2 = await t.servicio.corregirSerial(U2, 'X', { usuarioId: 'u', motivo: 'm' });
      const r3 = await t.servicio.corregirSerial(U3, '  ', { usuarioId: 'u', motivo: 'm' });
      expect(r1.getError()).toBeInstanceOf(UnidadNoDisponibleError);
      expect(r2.getError()).toBeInstanceOf(UnidadNoDisponibleError);
      expect(r3.getError()).toBeInstanceOf(SerialRequeridoError);
      expect(t.escribio()).toBe(false);
    });

    it('corrige también una unidad ENTREGADA o DESCARTADA (conserva su estado en el CAS)', async () => {
      const entregada = unidad(U1);
      entregada.entregar();
      const descartada = unidad(U2);
      descartada.descartarDeDeposito();
      const t = armar({ unidades: [entregada, descartada] });
      await t.servicio.corregirSerial(U1, 'A', { usuarioId: 'u', motivo: 'm' });
      await t.servicio.corregirSerial(U2, 'B', { usuarioId: 'u', motivo: 'm' });
      expect(t.llamadas.filter((l) => l.startsWith('W:cas'))).toEqual([
        'W:cas:ENTREGADA',
        'W:cas:DESCARTADA',
      ]);
    });
  });
  describe('operaciones de equipo', () => {
    const instalada = (id: string, over: Parameters<typeof unidad>[1] = {}) => {
      const u = unidad(id, over);
      u.instalar(EQ);
      return u;
    };
    describe('instalar', () => {
      it('instala un lote de N: CAS, SALIDA con equipo y evento INSTALACION con equipo y componente', async () => {
        const t = armar({ unidades: [unidad(U1), unidad(U2, { condicion: 'USADO' })] });
        const r = await t.servicio.instalar([item(U1, C1), item(U2, C2)], {
          usuarioId: 'u-1',
          motivo: ' alta ',
        });
        expect(r.getValue().map((x) => [x.unidad.estado, x.unidad.equipoId])).toEqual([
          ['INSTALADA', EQ],
          ['INSTALADA', EQ],
        ]);
        expect(
          t.movimientos.map((m) => [m.tipo, m.condicion, m.cantidad, m.equipoId, m.unidadId]),
        ).toEqual([
          ['SALIDA', 'NUEVO', 1, EQ, U1],
          ['SALIDA', 'USADO', 1, EQ, U2],
        ]);
        expect(t.eventos.map((e) => [e.tipo, e.equipoId, e.componenteId, e.motivo])).toEqual([
          ['INSTALACION', EQ, C1, 'alta'],
          ['INSTALACION', EQ, C2, 'alta'],
        ]);
        expect(t.eventos[0].movimientoId).toBe(t.movimientos[0].id);
      });

      it('toma L1 y L2 de todos los insumos y L3 de todas las unidades, en orden de id, antes de escribir', async () => {
        const t = armar({
          unidades: [unidad(U1, { insumo: OTRO_INSUMO }), unidad(U2), unidad(U3)],
        });
        await t.servicio.instalar([item(U3, C3), item(U1, C1), item(U2, C2)], { usuarioId: 'u' });
        const primerasNueve = t.llamadas.filter((l) => !l.startsWith('R:')).slice(0, 5);
        expect(primerasNueve).toEqual([
          `L1:${INSUMO}`,
          `L1:${OTRO_INSUMO}`,
          `L2:${INSUMO}`,
          `L2:${OTRO_INSUMO}`,
          `L3:${U1},${U2},${U3}`,
        ]);
        expect(t.llamadas.findIndex((l) => l.startsWith('W:'))).toBeGreaterThan(
          t.llamadas.findIndex((l) => l.startsWith('L3:')),
        );
      });

      it('rechaza una pendiente, una no EN_DEPOSITO, una repetida o inexistente, sin escribir nada del lote', async () => {
        const casos: Array<[ReturnType<typeof item>[], UnidadInsumoEntity[], unknown]> = [
          [
            [item(U1, C1), item(U2, C2)],
            [unidad(U1), unidad(U2, { serial: null })],
            UnidadNoDisponibleError,
          ],
          [[item(U1, C1), item(U2, C2)], [unidad(U1), instalada(U2)], UnidadNoDisponibleError],
          [[item(U1, C1), item(U1, C2)], [unidad(U1)], UnidadNoDisponibleError],
          [[item(U1, C1), item(U2, C2)], [unidad(U1)], UnidadNoEncontradaError],
        ];
        for (const [items, unidades, clase] of casos) {
          const t = armar({ unidades });
          const r = await t.servicio.instalar(items, { usuarioId: 'u' });
          expect(r.getError()).toBeInstanceOf(clase);
          expect(t.escribio()).toBe(false);
        }
      });

      it('un insumo que no es SERIE o inexistente se rechaza tras L1, sin L2 ni escritura', async () => {
        const ninguno = armar({ seguimiento: 'NINGUNO', unidades: [unidad(U1)] });
        const r = await ninguno.servicio.instalar([item(U1, C1)], { usuarioId: 'u' });
        expect(r.getError()).toBeInstanceOf(UnidadNoAdmitidaError);
        expect(ninguno.llamadas.filter((l) => l.startsWith('L2') || l.startsWith('W'))).toEqual([]);

        const inexistente = armar({ seguimiento: null, unidades: [unidad(U1)] });
        expect(
          (await inexistente.servicio.instalar([item(U1, C1)], { usuarioId: 'u' })).getError(),
        ).toBeInstanceOf(InsumoNoEncontradoError);
      });

      it('un lote vacío no toma locks ni escribe', async () => {
        const t = armar({});
        expect((await t.servicio.instalar([], { usuarioId: 'u' })).getValue()).toEqual([]);
        expect(t.llamadas).toEqual([]);
      });
    });

    describe('devolverAlDeposito', () => {
      it('devuelve un lote USADO con ENTRADA USADO y evento RETIRO_A_DEPOSITO con equipo, componente y motivo compartido', async () => {
        const t = armar({ unidades: [instalada(U1), instalada(U2)] });
        const r = await t.servicio.devolverAlDeposito([item(U1, C1), item(U2, C2)], {
          usuarioId: 'u',
          motivo: 'baja del equipo',
        });
        expect(
          r.getValue().map((x) => [x.unidad.estado, x.unidad.condicion, x.unidad.equipoId]),
        ).toEqual([
          ['EN_DEPOSITO', 'USADO', null],
          ['EN_DEPOSITO', 'USADO', null],
        ]);
        expect(t.movimientos.map((m) => [m.tipo, m.condicion, m.cantidad, m.motivo])).toEqual([
          ['ENTRADA', 'USADO', 1, 'baja del equipo'],
          ['ENTRADA', 'USADO', 1, 'baja del equipo'],
        ]);
        expect(t.eventos.map((e) => [e.tipo, e.equipoId, e.componenteId, e.motivo])).toEqual([
          ['RETIRO_A_DEPOSITO', EQ, C1, 'baja del equipo'],
          ['RETIRO_A_DEPOSITO', EQ, C2, 'baja del equipo'],
        ]);
        expect(t.llamadas.filter((l) => l.startsWith('W:cas'))).toEqual([
          'W:cas:INSTALADA',
          'W:cas:INSTALADA',
        ]);
      });

      it('si falla la segunda unidad (no instalada, o instalada en otro equipo) no escribe la primera', async () => {
        for (const segunda of [unidad(U2), instalada(U2)]) {
          const t = armar({ unidades: [instalada(U1), segunda] });
          const r = await t.servicio.devolverAlDeposito(
            [item(U1, C1), item(U2, C2, segunda.estado === 'INSTALADA' ? 'eq-otro' : EQ)],
            { usuarioId: 'u' },
          );
          expect(r.getError()).toBeInstanceOf(UnidadNoDisponibleError);
          expect(t.escribio()).toBe(false);
        }
      });
    });

    describe('descartarInstaladas', () => {
      it('descarta un lote sin movimiento y con evento DESCARTE con equipo, componente y motivo', async () => {
        const t = armar({ unidades: [instalada(U1), instalada(U2)] });
        const r = await t.servicio.descartarInstaladas([item(U1, C1), item(U2, C2)], {
          usuarioId: 'u',
          motivo: 'rota',
        });
        expect(r.getValue().map((x) => [x.estado, x.equipoId])).toEqual([
          ['DESCARTADA', null],
          ['DESCARTADA', null],
        ]);
        expect(t.movimientos).toHaveLength(0);
        expect(
          t.eventos.map((e) => [e.tipo, e.equipoId, e.componenteId, e.motivo, e.movimientoId]),
        ).toEqual([
          ['DESCARTE', EQ, C1, 'rota', null],
          ['DESCARTE', EQ, C2, 'rota', null],
        ]);
      });

      it('si falla una unidad del lote no escribe ninguna', async () => {
        const t = armar({ unidades: [instalada(U1), unidad(U2)] });
        const r = await t.servicio.descartarInstaladas([item(U1, C1), item(U2, C2)], {
          usuarioId: 'u',
        });
        expect(r.getError()).toBeInstanceOf(UnidadNoDisponibleError);
        expect(t.escribio()).toBe(false);
      });
    });
  });
});
