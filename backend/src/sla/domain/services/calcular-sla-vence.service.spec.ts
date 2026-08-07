/**
 * SA1 [UNIT] — RED→GREEN: CalcularSlaVenceService (cálculo puro de dominio).
 *
 * Reloj 24/7 (calendario corrido, sin horario laboral en beta, spec S2):
 * `venceAt = creadoEn + horas` en milisegundos exactos, sin importar fin de
 * semana ni feriados — cruza medianoche/fin de semana "sin saltos".
 *
 * Ref spec: sdd/premium/spec S2. Ref design: ADR-P4 (firma). Tarea: SA1.
 */
import { CalcularSlaVenceService } from './calcular-sla-vence.service';

describe('CalcularSlaVenceService', () => {
  const service = new CalcularSlaVenceService();

  it('venceAt() suma horas exactas (24/7) sobre creadoEn', () => {
    const creadoEn = new Date('2026-08-06T10:00:00.000Z');
    const resultado = service.venceAt(creadoEn, 4);
    expect(resultado.toISOString()).toBe('2026-08-06T14:00:00.000Z');
  });

  it('venceAt() cruza medianoche sin saltos (24/7, sin horario laboral)', () => {
    const creadoEn = new Date('2026-08-06T22:00:00.000Z');
    const resultado = service.venceAt(creadoEn, 4);
    expect(resultado.toISOString()).toBe('2026-08-07T02:00:00.000Z');
  });

  it('venceAt() cruza el fin de semana sin saltos (24 horas = MEDIA)', () => {
    // 2026-08-07 es viernes; +24h cae sábado, sin ajuste laboral.
    const creadoEn = new Date('2026-08-07T09:00:00.000Z');
    const resultado = service.venceAt(creadoEn, 24);
    expect(resultado.toISOString()).toBe('2026-08-08T09:00:00.000Z');
  });

  it('venceAt() lanza si horas no es > 0 (config inconsistente)', () => {
    const creadoEn = new Date('2026-08-06T10:00:00.000Z');
    expect(() => service.venceAt(creadoEn, 0)).toThrow(/horas/i);
    expect(() => service.venceAt(creadoEn, -1)).toThrow(/horas/i);
  });
});
