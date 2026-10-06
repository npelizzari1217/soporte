/**
 * reloj-sla.meta.spec.ts — WU-3c (sdd/sla-primera-respuesta-y-pausa, ADR-4; sla-reloj-activo R2, R3, R9):
 * vencimiento derivado y meta aplicada sobre un reloj ya plegado.
 */
import { RelojSla, RelojSlaResultado } from './reloj-sla';
import { H, L, corrido, habil } from './reloj-sla.fixtures';

const base = (over: Partial<RelojSlaResultado> = {}): RelojSlaResultado => ({
  acumuladoS: 3 * H,
  metaS: null,
  correDesde: L(11, 9),
  cumplido: null,
  ...over,
});
const conMeta = (
  b: RelojSlaResultado,
  metaS: number | null,
  estadoCodigo: string,
  vencimientoActual: Date | null = null,
  medidor = habil(),
) => RelojSla.conMeta(b, { metaS, estadoCodigo, vencimientoActual }, medidor);

describe('RelojSla.vencimientoDerivado', () => {
  const derivar = (acumuladoS: number, vencimientoActual: Date | null, metaS = 8 * H) =>
    RelojSla.vencimientoDerivado({
      metaS,
      acumuladoS,
      correDesde: L(11, 9),
      vencimientoActual,
      medidor: habil(),
    });

  it('suma lo que falta (meta - acumulado) desde el inicio del tramo', () => {
    expect(derivar(3 * H, null)).toEqual(L(11, 14));
  });

  it('con la meta superada conserva el vencimiento anterior al tramo (la pausa no perdona el exceso)', () => {
    expect(derivar(9 * H, L(10, 17))).toEqual(L(10, 17));
  });

  it('con la meta superada y sin vencimiento previo queda en el inicio del tramo', () => {
    expect(derivar(8 * H, null)).toEqual(L(11, 9));
  });
});

describe('RelojSla.conMeta', () => {
  it('con el reloj corriendo deriva el vencimiento y conserva lo acumulado', () => {
    const r = conMeta(base(), 4 * H, 'EN_PROCESO');

    expect(r).toMatchObject({ acumuladoS: 3 * H, metaS: 4 * H, slaVenceAt: L(11, 10) });
  });

  it('cohorte CORRIDO: suma tiempo de pared (meta 24 h, 10 h activas)', () => {
    const r = conMeta(base({ acumuladoS: 10 * H }), 24 * H, 'EN_PROCESO', null, corrido());

    expect(r.slaVenceAt).toEqual(new Date(L(11, 9).getTime() + 14 * 3600_000));
  });

  it('detenido fija la meta pero no toca el vencimiento', () => {
    const r = conMeta(base({ correDesde: null }), 4 * H, 'ESPERANDO_CLIENTE');

    expect(r.metaS).toBe(4 * H);
    expect(r.slaVenceAt).toBeUndefined();
  });

  it('un vencimiento ya derivado por el pliegue de esta pasada manda sobre el de la fila', () => {
    const r = conMeta(
      base({ acumuladoS: 9 * H, slaVenceAt: L(10, 17) }),
      8 * H,
      'EN_PROCESO',
      L(9, 9),
    );

    expect(r.slaVenceAt).toEqual(L(10, 17));
  });

  it.each([['EN_PROCESO'], ['RESUELTO']])(
    'sin meta (preventivo, sin slaHoras o slaActivo=false) en %s: meta, cumplimiento y vencimiento null',
    (estado) => {
      const r = conMeta(base({ cumplido: true }), null, estado, L(11, 17));

      expect(r).toMatchObject({ metaS: null, cumplido: null, slaVenceAt: null });
    },
  );

  describe('cumplimiento en RESUELTO', () => {
    const resuelto = (acumuladoS: number, metaS: number, cumplido: boolean | null = null) =>
      conMeta(base({ acumuladoS, correDesde: null, cumplido }), metaS, 'RESUELTO');

    it('recalcula con la meta nueva y no toca el vencimiento', () => {
      const r = resuelto(9 * H, 12 * H, false);

      expect(r.cumplido).toBe(true);
      expect(r.slaVenceAt).toBeUndefined();
    });

    it('acumulado igual a la meta cumple (borde `<=`)', () => {
      expect(resuelto(8 * H, 8 * H).cumplido).toBe(true);
    });

    it('9 h sobre una meta de 8 h no cumple', () => {
      expect(resuelto(9 * H, 8 * H).cumplido).toBe(false);
    });
  });

  it('fuera de RESUELTO no inventa un cumplimiento', () => {
    expect(conMeta(base(), 8 * H, 'EN_PROCESO').cumplido).toBeNull();
  });
});
