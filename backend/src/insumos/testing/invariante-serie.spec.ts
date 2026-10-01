import { EventoUnidadInsumoEntity } from '../domain/entities/evento-unidad-insumo.entity';
import { TipoEventoUnidad, UnidadInsumoEntity } from '../domain/entities/unidad-insumo.entity';
import { leerYVerificarInvarianteSerie, verificarInvarianteSerie } from './invariante-serie';
import { sumasCon, sumasEnCero } from './sumas-movimiento';

const U1 = '00000000-0000-4000-8000-000000000001';

function ev(tipo: TipoEventoUnidad): EventoUnidadInsumoEntity {
  return EventoUnidadInsumoEntity.create({
    unidadId: U1,
    tipo,
    usuarioId: 'u',
    motivo: tipo === 'CORRECCION_SERIAL' ? 'typo' : null,
  });
}

function unidadEnDeposito(): UnidadInsumoEntity {
  return UnidadInsumoEntity.crearEnDeposito(
    { insumoId: 'i', condicion: 'NUEVO', numeroSerie: 'A' },
    U1,
  ).getValue();
}

describe('verificarInvarianteSerie', () => {
  it('se cumple con el conteo igual al saldo del libro y el último evento coherente', () => {
    const r = verificarInvarianteSerie({
      conteoEnDeposito: { NUEVO: 1, USADO: 0 },
      sumasDelLibro: sumasCon({ NUEVO: { ENTRADA: 1 } }),
      unidades: [{ unidad: unidadEnDeposito(), eventos: [ev('INGRESO')] }],
    });
    expect(r).toEqual([]);
  });

  it('detecta un conteo distinto del saldo del libro, por condición', () => {
    const r = verificarInvarianteSerie({
      conteoEnDeposito: { NUEVO: 1, USADO: 1 },
      sumasDelLibro: sumasCon({ NUEVO: { ENTRADA: 1 } }),
      unidades: [],
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toContain('USADO');
  });

  it('detecta una unidad cuyo último evento no coincide con su estado', () => {
    const entregada = unidadEnDeposito();
    entregada.entregar();
    const r = verificarInvarianteSerie({
      conteoEnDeposito: { NUEVO: 0, USADO: 0 },
      sumasDelLibro: sumasEnCero(),
      unidades: [{ unidad: entregada, eventos: [ev('INGRESO')] }],
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toContain('ENTREGADA');
  });

  it('salta SERIAL_CARGADO y CORRECCION_SERIAL: no mueven el estado', () => {
    const r = verificarInvarianteSerie({
      conteoEnDeposito: { NUEVO: 1, USADO: 0 },
      sumasDelLibro: sumasCon({ NUEVO: { ENTRADA: 1 } }),
      unidades: [
        {
          unidad: unidadEnDeposito(),
          eventos: [ev('INGRESO'), ev('SERIAL_CARGADO'), ev('CORRECCION_SERIAL')],
        },
      ],
    });
    expect(r).toEqual([]);
  });

  it('una unidad sin eventos que determinen su estado es una violación', () => {
    const r = verificarInvarianteSerie({
      conteoEnDeposito: { NUEVO: 1, USADO: 0 },
      sumasDelLibro: sumasCon({ NUEVO: { ENTRADA: 1 } }),
      unidades: [{ unidad: unidadEnDeposito(), eventos: [ev('SERIAL_CARGADO')] }],
    });
    expect(r).toHaveLength(1);
  });

  it('una devolución de entrega deja EN_DEPOSITO y coincide con el libro', () => {
    const u = unidadEnDeposito();
    u.entregar();
    u.devolverEntrega('USADO');
    const r = verificarInvarianteSerie({
      conteoEnDeposito: { NUEVO: 0, USADO: 1 },
      sumasDelLibro: sumasCon({ NUEVO: { ENTRADA: 1, SALIDA: 1 }, USADO: { ENTRADA: 1 } }),
      unidades: [
        { unidad: u, eventos: [ev('INGRESO'), ev('ENTREGA'), ev('DEVOLUCION_DE_ENTREGA')] },
      ],
    });
    expect(r).toEqual([]);
  });
});

describe('leerYVerificarInvarianteSerie', () => {
  it('lee los repositorios y aplica la misma verificación', async () => {
    const u = unidadEnDeposito();
    const r = await leerYVerificarInvarianteSerie(
      {
        unidadRepo: {
          listarPorInsumo: async () => [u],
          contarEnDepositoPorCondicion: async () => ({ NUEVO: 1, USADO: 0 }),
        },
        movimientoRepo: { sumByTipo: async () => sumasCon({ NUEVO: { ENTRADA: 1 } }) },
        eventoRepo: { listarPorUnidad: async () => [ev('INGRESO')] },
      },
      'i',
    );
    expect(r).toEqual([]);
  });
});
