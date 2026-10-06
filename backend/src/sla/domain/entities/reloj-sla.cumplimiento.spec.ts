/**
 * reloj-sla.cumplimiento.spec.ts — WU-3b (sdd/sla-primera-respuesta-y-pausa, sla-reloj-activo R3, R6-R9):
 * cumplimiento fijado en cada resolución e incorporación perezosa de tickets previos.
 */
import { afectaRelojSla } from '../../../tickets/domain/state-machine/estados.constants';
import { RelojSla, RelojSlaFila, TransicionReloj } from './reloj-sla';
import { H, L, corrido, fila, habil, op } from './reloj-sla.fixtures';

describe('RelojSla.plegar', () => {
  describe('cumplimiento', () => {
    const resolver = (over: Partial<RelojSlaFila>, ops: TransicionReloj[]) =>
      RelojSla.plegar({
        fila: fila({ estadoCodigo: 'RESUELTO', ...over }),
        medidor: habil(),
        historialSinSecuencia: [],
        transiciones: ops,
      });

    it('5 h activas y 7 días de espera sobre meta 8 h cumple', () => {
      const r = resolver({ acumuladoS: 5 * H, correDesde: null }, [
        op('ESPERANDO_CLIENTE', 'RESUELTO', L(17, 12)),
      ]);

      expect(r.cumplido).toBe(true);
      expect(r.acumuladoS).toBe(5 * H);
    });

    it('acumulado igual a la meta cumple (borde `<=`)', () => {
      const r = resolver({}, [op('EN_PROCESO', 'RESUELTO', L(10, 17))]);

      expect(r.acumuladoS).toBe(8 * H);
      expect(r.cumplido).toBe(true);
    });

    it('la meta es la fijada en el ticket: tras bajar las horas de la prioridad a 4 h, resolver con 6 h sobre una meta de 8 h cumple', () => {
      // El pliegue no consulta la prioridad: solo `fila.metaS`, que fija AplicarSla al crear o repriorizar.
      const r = resolver({ metaS: 8 * H, acumuladoS: 6 * H, correDesde: null }, [
        op('ESPERANDO_CLIENTE', 'RESUELTO', L(11, 12)),
      ]);

      expect(r.cumplido).toBe(true);
    });

    it('9 h sobre una meta de 8 h no cumple de inmediato', () => {
      const r = resolver({}, [op('EN_PROCESO', 'RESUELTO', L(10, 18))]);

      expect(r.cumplido).toBe(false);
    });

    it('reapertura con 7 h + 2 h da 9 h y gana la última resolución; el tiempo en RESUELTO no suma', () => {
      const r = resolver({ acumuladoS: 7 * H, correDesde: null, cumplido: true }, [
        op('RESUELTO', 'EN_PROCESO', L(14, 9)),
        op('EN_PROCESO', 'RESUELTO', L(14, 11)),
      ]);

      expect(r.acumuladoS).toBe(9 * H);
      expect(r.cumplido).toBe(false);
    });

    it('la reapertura limpia el cumplimiento mientras el reloj corre', () => {
      const r = RelojSla.plegar({
        fila: fila({ acumuladoS: 7 * H, correDesde: null, cumplido: true }),
        medidor: habil(),
        historialSinSecuencia: [],
        transiciones: [op('RESUELTO', 'EN_PROCESO', L(14, 9))],
      });

      expect(r.cumplido).toBeNull();
    });

    it('CERRADO no cambia el cumplimiento', () => {
      const r = resolver({ acumuladoS: 5 * H, correDesde: null, cumplido: true }, [
        op('RESUELTO', 'CERRADO', L(17, 9)),
      ]);

      expect(r.cumplido).toBe(true);
    });

    it('preventivo (meta null) deja cumplido null', () => {
      const r = resolver({ metaS: null }, [op('EN_PROCESO', 'RESUELTO', L(10, 12))]);

      expect(r.cumplido).toBeNull();
    });
  });

  describe('incorporación de previos (acumulado NULL)', () => {
    const previo = (over: Partial<RelojSlaFila> = {}) =>
      fila({
        estadoCodigo: 'ESPERANDO_CLIENTE',
        acumuladoS: null,
        metaS: null,
        correDesde: null,
        slaVenceAt: L(11, 12),
        ...over,
      });

    it('acumulado 0, corre_desde createdAt, meta = tiempo hábil hasta slaVenceAt; pliega primero el historial sin secuencia', () => {
      const r = RelojSla.plegar({
        fila: previo(),
        medidor: habil(),
        historialSinSecuencia: [op('ASIGNADO', 'EN_PROCESO', L(10, 10))],
        transiciones: [op('EN_PROCESO', 'ESPERANDO_CLIENTE', L(10, 13))],
      });

      // Lunes 09:00-18:00 (9 h) + martes 09:00-12:00 (3 h).
      expect(r.metaS).toBe(12 * H);
      expect(r.acumuladoS).toBe(4 * H);
      expect(r.correDesde).toBeNull();
      expect(r.slaVenceAt).toBeUndefined();
    });

    it('la meta de un previo CORRIDO es tiempo de pared', () => {
      const r = RelojSla.plegar({
        fila: previo({ slaRegla: 'CORRIDO', slaVenceAt: L(11, 9) }),
        medidor: corrido(),
        historialSinSecuencia: [],
        transiciones: [op('EN_PROCESO', 'ESPERANDO_CLIENTE', L(10, 13))],
      });

      expect(r.metaS).toBe(24 * H);
    });

    it('un previo sin vencimiento queda sin meta', () => {
      const r = RelojSla.plegar({
        fila: previo({ slaVenceAt: null }),
        medidor: habil(),
        historialSinSecuencia: [],
        transiciones: [op('EN_PROCESO', 'ESPERANDO_CLIENTE', L(10, 13))],
      });

      expect(r.metaS).toBeNull();
    });

    it('un previo RESUELTO a CERRADO no marca, así que nunca se incorpora', () => {
      expect(afectaRelojSla('RESUELTO', 'CERRADO')).toBe(false);
    });
  });
});
