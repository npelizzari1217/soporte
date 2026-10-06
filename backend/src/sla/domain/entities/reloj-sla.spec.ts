/**
 * reloj-sla.spec.ts — WU-3b (sdd/sla-primera-respuesta-y-pausa, sla-reloj-activo R1, R2, R9):
 * pliegue puro de `RelojSla`: pausa, reanudación, vencimiento derivado y orden monótono.
 */
import { CalendarioLaboralSemanal } from '../../../calendario-laboral/domain/services/calcular-sla-habil-vence.service';
import { RelojSla } from './reloj-sla';
import { H, L, cerrado, corrido, fila, habil, op } from './reloj-sla.fixtures';

describe('RelojSla.plegar', () => {
  it('pausa, reanudación y pausa: tres operaciones suman los tres tramos sin perder ninguno', () => {
    const r = RelojSla.plegar({
      fila: fila({ estadoCodigo: 'ESPERANDO_CLIENTE' }),
      medidor: habil(),
      historialSinSecuencia: [],
      transiciones: [
        op('EN_PROCESO', 'ESPERANDO_CLIENTE', L(10, 11)),
        op('ESPERANDO_CLIENTE', 'EN_PROCESO', L(11, 9)),
        op('EN_PROCESO', 'ESPERANDO_CLIENTE', L(11, 12)),
      ],
    });

    expect(r.acumuladoS).toBe(5 * H);
    expect(r.correDesde).toBeNull();
  });

  it('entrar a espera con 3 h activas deja acumulado 3 h y reloj detenido', () => {
    const r = RelojSla.plegar({
      fila: fila({ estadoCodigo: 'ESPERANDO_CLIENTE' }),
      medidor: habil(),
      historialSinSecuencia: [],
      transiciones: [op('EN_PROCESO', 'ESPERANDO_CLIENTE', L(10, 12))],
    });

    expect(r.acumuladoS).toBe(3 * H);
    expect(r.correDesde).toBeNull();
  });

  it.each(['EN_PROCESO', 'NUEVO', 'ASIGNADO'])(
    'toda salida de la espera (a %s) reanuda desde ese instante',
    (destino) => {
      const r = RelojSla.plegar({
        fila: fila({ estadoCodigo: destino, acumuladoS: 3 * H, correDesde: null }),
        medidor: habil(),
        historialSinSecuencia: [],
        transiciones: [op('ESPERANDO_CLIENTE', destino, L(12, 9))],
      });

      expect(r.correDesde).toEqual(L(12, 9));
      expect(r.acumuladoS).toBe(3 * H);
    },
  );

  it('meta 8 h y 3 h activas, tras 2 días hábiles de espera el vencimiento queda 5 h hábiles después de reanudar', () => {
    const r = RelojSla.plegar({
      fila: fila({ acumuladoS: 3 * H, correDesde: null }),
      medidor: habil(),
      historialSinSecuencia: [],
      transiciones: [op('ESPERANDO_CLIENTE', 'EN_PROCESO', L(12, 9))],
    });

    expect(r.slaVenceAt).toEqual(L(12, 14));
  });

  it('pausa con el SLA ya vencido no suma la espera y conserva min(slaVenceAt, inicioTramo)', () => {
    const vencio = L(10, 18);
    const r = RelojSla.plegar({
      fila: fila({ acumuladoS: 9 * H, correDesde: null, slaVenceAt: vencio }),
      medidor: habil(),
      historialSinSecuencia: [],
      transiciones: [op('ESPERANDO_CLIENTE', 'EN_PROCESO', L(17, 9))],
    });

    expect(r.acumuladoS).toBe(9 * H);
    expect(r.slaVenceAt).toEqual(vencio);
  });

  it('con vencimiento posterior al inicio del tramo, el derivado es el inicio del tramo', () => {
    const r = RelojSla.plegar({
      fila: fila({ acumuladoS: 9 * H, correDesde: null, slaVenceAt: L(20, 18) }),
      medidor: habil(),
      historialSinSecuencia: [],
      transiciones: [op('ESPERANDO_CLIENTE', 'EN_PROCESO', L(17, 9))],
    });

    expect(r.slaVenceAt).toEqual(L(17, 9));
  });

  it('usa el calendario vigente al reanudar', () => {
    const abreALas10 = { aperturaMinuto: 600, cierreMinuto: 1080 };
    const calendario: CalendarioLaboralSemanal = [
      cerrado,
      abreALas10,
      abreALas10,
      abreALas10,
      abreALas10,
      abreALas10,
      cerrado,
    ];
    const r = RelojSla.plegar({
      fila: fila({ acumuladoS: 3 * H, correDesde: null }),
      medidor: habil(calendario),
      historialSinSecuencia: [],
      transiciones: [op('ESPERANDO_CLIENTE', 'EN_PROCESO', L(12, 9))],
    });

    expect(r.slaVenceAt).toEqual(L(12, 15));
  });

  it('cohorte CORRIDO: meta 24 h, 10 h activas y 48 h de pared en espera vencen 14 h de pared tras reanudar', () => {
    const inicio = new Date('2026-08-07T00:00:00.000Z');
    const horas = (n: number) => new Date(inicio.getTime() + n * 3_600_000);
    const r = RelojSla.plegar({
      fila: fila({ slaRegla: 'CORRIDO', metaS: 24 * H, correDesde: inicio }),
      medidor: corrido(),
      historialSinSecuencia: [],
      transiciones: [
        op('EN_PROCESO', 'ESPERANDO_CLIENTE', horas(10)),
        op('ESPERANDO_CLIENTE', 'EN_PROCESO', horas(58)),
      ],
    });

    expect(r.acumuladoS).toBe(10 * H);
    expect(r.slaVenceAt).toEqual(horas(72));
  });

  it('el cursor se ordena por tiempo recortado a monótono: sin tramos negativos', () => {
    const r = RelojSla.plegar({
      fila: fila({ estadoCodigo: 'ESPERANDO_CLIENTE' }),
      medidor: habil(),
      historialSinSecuencia: [],
      transiciones: [
        op('EN_PROCESO', 'ESPERANDO_CLIENTE', L(10, 12)),
        // created_at anterior a la operación previa: se recorta a las 12:00.
        op('ESPERANDO_CLIENTE', 'EN_PROCESO', L(10, 11)),
        op('EN_PROCESO', 'ESPERANDO_CLIENTE', L(10, 12, 30)),
      ],
    });

    expect(r.acumuladoS).toBe(3 * H + H / 2);
  });

  it('una operación anterior a corre_desde no resta tiempo', () => {
    const r = RelojSla.plegar({
      fila: fila({ estadoCodigo: 'ESPERANDO_CLIENTE', acumuladoS: 2 * H, correDesde: L(10, 12) }),
      medidor: habil(),
      historialSinSecuencia: [],
      transiciones: [op('EN_PROCESO', 'ESPERANDO_CLIENTE', L(10, 11))],
    });

    expect(r.acumuladoS).toBe(2 * H);
  });
});
