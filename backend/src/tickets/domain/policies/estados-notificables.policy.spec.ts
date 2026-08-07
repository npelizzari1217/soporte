/**
 * T7.1 [UNIT] — RED→GREEN: `esEstadoNotificable` (política de notificación,
 * ADR-6 — destinos notificables: RESUELTO, CERRADO).
 *
 * Ref spec: sdd/tickets-core/spec T13. Ref design: ADR-6. Tarea: T7.1.
 */
import { esEstadoNotificable } from './estados-notificables.policy';

describe('esEstadoNotificable (T7.1)', () => {
  it('RESUELTO es notificable', () => {
    expect(esEstadoNotificable('RESUELTO')).toBe(true);
  });

  it('CERRADO es notificable', () => {
    expect(esEstadoNotificable('CERRADO')).toBe(true);
  });

  it('NUEVO, ASIGNADO, EN_PROCESO y CANCELADO NO son notificables', () => {
    expect(esEstadoNotificable('NUEVO')).toBe(false);
    expect(esEstadoNotificable('ASIGNADO')).toBe(false);
    expect(esEstadoNotificable('EN_PROCESO')).toBe(false);
    expect(esEstadoNotificable('CANCELADO')).toBe(false);
  });

  it('un código desconocido NO es notificable (fail-safe)', () => {
    expect(esEstadoNotificable('CODIGO_INEXISTENTE')).toBe(false);
  });
});
