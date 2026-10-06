import { describe, expect, it } from 'vitest';
import { derivarEstadoPrimeraRespuesta, derivarEstadoSla } from './estado-sla-derivado.policy';

const AHORA = new Date('2026-03-10T12:00:00.000Z');
const ANTES = new Date('2026-03-10T10:00:00.000Z');
const DESPUES = new Date('2026-03-10T14:00:00.000Z');

const base = { slaVenceAt: DESPUES, fechaCierre: null, cumplido: null };

describe('derivarEstadoSla', () => {
  it('ESPERANDO_CLIENTE da EN_PAUSA aunque el vencimiento guardado ya haya pasado', () => {
    expect(derivarEstadoSla({ ...base, slaVenceAt: ANTES }, 'ESPERANDO_CLIENTE', AHORA)).toBe(
      'EN_PAUSA',
    );
  });

  it.each(['NUEVO', 'ASIGNADO', 'EN_PROCESO'])(
    'con el reloj corriendo en %s: VENCIDO si el vencimiento pasó y AL_DIA si no',
    (estado) => {
      expect(derivarEstadoSla({ ...base, slaVenceAt: ANTES }, estado, AHORA)).toBe('VENCIDO');
      expect(derivarEstadoSla(base, estado, AHORA)).toBe('AL_DIA');
    },
  );

  it('no usa slaVenceAt vigente para corriendo: un reabierto con cumplido=null se deriva de las fechas', () => {
    expect(
      derivarEstadoSla(
        { slaVenceAt: DESPUES, fechaCierre: null, cumplido: null },
        'EN_PROCESO',
        AHORA,
      ),
    ).toBe('AL_DIA');
  });

  it('resuelto con cumplido=false da VENCIDO sin marca del barrido', () => {
    expect(derivarEstadoSla({ ...base, cumplido: false }, 'RESUELTO', AHORA)).toBe('VENCIDO');
  });

  it('resuelto con cumplido=true da AL_DIA', () => {
    expect(derivarEstadoSla({ ...base, cumplido: true }, 'RESUELTO', AHORA)).toBe('AL_DIA');
  });

  it('previo sin cumplimiento: fechaCierre > slaVenceAt da VENCIDO y fechaCierre <= slaVenceAt da AL_DIA', () => {
    const previo = { slaVenceAt: AHORA, cumplido: null };
    expect(derivarEstadoSla({ ...previo, fechaCierre: DESPUES }, 'CERRADO', AHORA)).toBe('VENCIDO');
    expect(derivarEstadoSla({ ...previo, fechaCierre: ANTES }, 'CERRADO', AHORA)).toBe('AL_DIA');
  });

  it('sin vencimiento (preventivo o sin SLA) da SIN_SLA, también en espera', () => {
    const sin = { slaVenceAt: null, fechaCierre: null, cumplido: null };
    expect(derivarEstadoSla(sin, 'EN_PROCESO', AHORA)).toBe('SIN_SLA');
    expect(derivarEstadoSla(sin, 'ESPERANDO_CLIENTE', AHORA)).toBe('SIN_SLA');
  });
});

describe('derivarEstadoPrimeraRespuesta', () => {
  it('sin meta da SIN_META', () => {
    expect(derivarEstadoPrimeraRespuesta({ venceAt: null, at: null }, AHORA)).toBe('SIN_META');
  });

  it('sin respuesta: PENDIENTE antes del vencimiento y VENCIDA después', () => {
    expect(derivarEstadoPrimeraRespuesta({ venceAt: DESPUES, at: null }, AHORA)).toBe('PENDIENTE');
    expect(derivarEstadoPrimeraRespuesta({ venceAt: ANTES, at: null }, AHORA)).toBe('VENCIDA');
  });

  it('con respuesta a tiempo (incluido el borde) da CUMPLIDA', () => {
    expect(derivarEstadoPrimeraRespuesta({ venceAt: DESPUES, at: ANTES }, AHORA)).toBe('CUMPLIDA');
    expect(derivarEstadoPrimeraRespuesta({ venceAt: ANTES, at: ANTES }, AHORA)).toBe('CUMPLIDA');
  });

  it('con respuesta tardía da VENCIDA', () => {
    expect(derivarEstadoPrimeraRespuesta({ venceAt: ANTES, at: AHORA }, AHORA)).toBe('VENCIDA');
  });
});
