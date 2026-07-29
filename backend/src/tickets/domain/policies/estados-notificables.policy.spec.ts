import { esEstadoNotificable, ESTADOS_NOTIFICABLES } from './estados-notificables.policy';

/**
 * 1.7 — RED: esEstadoNotificable() — true para los 5 códigos del set,
 * false para el resto. Función pura, sin DB (D4).
 *
 * Ref spec: Requirement 1, §0 (set fijado: RESUELTO, RECHAZADO, SIN_SOLUCION,
 * CERRADO, CANCELADO), Scenarios "en el set"/"fuera del set".
 * Tarea: PR1 1.7
 */
describe('esEstadoNotificable()', () => {
  it.each(['RESUELTO', 'RECHAZADO', 'SIN_SOLUCION', 'CERRADO', 'CANCELADO'])(
    'retorna true para %s (dentro del set)',
    (codigo) => {
      expect(esEstadoNotificable(codigo)).toBe(true);
    },
  );

  it.each(['ABIERTO', 'PENDIENTE_APROBACION', 'APROBADO', 'EN_PROGRESO', 'SUSPENDIDO', ''])(
    'retorna false para %s (fuera del set)',
    (codigo) => {
      expect(esEstadoNotificable(codigo)).toBe(false);
    },
  );

  it('el set ESTADOS_NOTIFICABLES contiene exactamente los 5 códigos esperados', () => {
    expect(ESTADOS_NOTIFICABLES).toEqual(
      new Set(['RESUELTO', 'RECHAZADO', 'SIN_SOLUCION', 'CERRADO', 'CANCELADO']),
    );
  });

  it('el filtro es puro — evalúa por código, sin importar el tipo de ticket', () => {
    // No recibe tipoCodigo como parámetro; misma entrada, mismo resultado siempre.
    expect(esEstadoNotificable('CERRADO')).toBe(esEstadoNotificable('CERRADO'));
  });
});
