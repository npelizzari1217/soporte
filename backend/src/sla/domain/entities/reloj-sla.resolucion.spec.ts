/**
 * reloj-sla.resolucion.spec.ts — T2 de odd/promedios-dashboard-habiles (CA2): el pliegue devuelve el
 * tiempo hábil de resolución que guarda el ticket para el dashboard.
 */
import { RelojSla, RelojSlaFila, TransicionReloj } from './reloj-sla';
import { H, L, corrido, fila, habil, op } from './reloj-sla.fixtures';

describe('RelojSla.plegar — resolucionHabilS', () => {
  const plegar = (over: Partial<RelojSlaFila>, ops: TransicionReloj[], medidor = habil()) =>
    RelojSla.plegar({ fila: fila(over), medidor, historialSinSecuencia: [], transiciones: ops });

  it('al llegar a RESUELTO es el acumulado final, con el último tramo incluido', () => {
    const r = plegar({ estadoCodigo: 'RESUELTO', acumuladoS: 2 * H, correDesde: L(11, 9) }, [
      op('EN_PROCESO', 'RESUELTO', L(11, 12)),
    ]);

    expect(r.acumuladoS).toBe(5 * H);
    expect(r.resolucionHabilS).toBe(5 * H);
  });

  it('no cuenta las pausas: la espera del cliente queda fuera', () => {
    const r = plegar({ estadoCodigo: 'RESUELTO' }, [
      op('EN_PROCESO', 'ESPERANDO_CLIENTE', L(10, 11)),
      op('ESPERANDO_CLIENTE', 'EN_PROCESO', L(12, 9)),
      op('EN_PROCESO', 'RESUELTO', L(12, 10)),
    ]);

    expect(r.resolucionHabilS).toBe(3 * H);
  });

  it('al pasar a CERRADO no cambia', () => {
    const r = plegar({ estadoCodigo: 'CERRADO', acumuladoS: 5 * H, correDesde: null }, [
      op('RESUELTO', 'CERRADO', L(14, 9)),
    ]);

    expect(r.resolucionHabilS).toBe(5 * H);
  });

  it('al reabrir queda null', () => {
    const r = plegar({ estadoCodigo: 'EN_PROCESO', acumuladoS: 5 * H, correDesde: null }, [
      op('RESUELTO', 'EN_PROCESO', L(14, 9)),
    ]);

    expect(r.resolucionHabilS).toBeNull();
    expect(r.acumuladoS).toBe(5 * H);
  });

  it('al volver a RESUELTO se toma de nuevo, sumando el tramo reabierto', () => {
    const r = plegar({ estadoCodigo: 'RESUELTO', acumuladoS: 5 * H, correDesde: null }, [
      op('RESUELTO', 'EN_PROCESO', L(14, 9)),
      op('EN_PROCESO', 'RESUELTO', L(14, 11)),
    ]);

    expect(r.resolucionHabilS).toBe(7 * H);
  });

  it('en espera del cliente queda null: el ticket no está resuelto', () => {
    const r = plegar({ estadoCodigo: 'ESPERANDO_CLIENTE' }, [
      op('EN_PROCESO', 'ESPERANDO_CLIENTE', L(10, 12)),
    ]);

    expect(r.resolucionHabilS).toBeNull();
  });

  it('un ticket CORRIDO resuelto no toca el valor guardado (undefined): su acumulado no es tiempo hábil', () => {
    const r = plegar(
      { estadoCodigo: 'RESUELTO', slaRegla: 'CORRIDO' },
      [op('EN_PROCESO', 'RESUELTO', L(11, 9))],
      corrido(),
    );

    expect(r.acumuladoS).toBe(24 * H);
    // El backfill pudo haberlo llenado: un pliegue posterior no lo puede borrar.
    expect(r.resolucionHabilS).toBeUndefined();
  });

  it('un ticket CORRIDO cerrado tampoco toca el valor guardado', () => {
    const r = plegar(
      { estadoCodigo: 'CERRADO', slaRegla: 'CORRIDO', acumuladoS: 5 * H, correDesde: null },
      [op('RESUELTO', 'CERRADO', L(14, 9))],
      corrido(),
    );

    expect(r.resolucionHabilS).toBeUndefined();
  });

  it('un ticket CORRIDO reabierto queda null, igual que uno HABIL', () => {
    const r = plegar(
      { estadoCodigo: 'EN_PROCESO', slaRegla: 'CORRIDO', acumuladoS: 5 * H, correDesde: null },
      [op('RESUELTO', 'EN_PROCESO', L(14, 9))],
      corrido(),
    );

    expect(r.resolucionHabilS).toBeNull();
  });

  it('sin meta (preventivo o slaActivo=false) igual se guarda: el reloj acumula sin meta', () => {
    const r = plegar({ estadoCodigo: 'RESUELTO', metaS: null }, [
      op('EN_PROCESO', 'RESUELTO', L(10, 13)),
    ]);

    expect(r.cumplido).toBeNull();
    expect(r.resolucionHabilS).toBe(4 * H);
  });
});
