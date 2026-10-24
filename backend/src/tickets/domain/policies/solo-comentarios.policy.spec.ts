import {
  ESTADOS_SOLO_COMENTARIOS,
  esEstadoSoloComentarios,
  ticketSoloComentarios,
} from './solo-comentarios.policy';

describe('ticketSoloComentarios (odd/cerrado-solo-comentarios, S1-S3)', () => {
  it('los estados de solo comentarios son RESUELTO, CERRADO y CANCELADO (S2)', () => {
    expect([...ESTADOS_SOLO_COMENTARIOS]).toEqual(['RESUELTO', 'CERRADO', 'CANCELADO']);
  });

  it.each([
    ['NUEVO', false],
    ['ASIGNADO', false],
    ['EN_PROCESO', false],
    ['ESPERANDO_CLIENTE', false],
    ['RESUELTO', true],
    ['CERRADO', true],
    ['CANCELADO', true],
    // Un código fuera del catálogo no deja al ticket en solo comentarios.
    ['X', false],
  ])('%s, actor no administrador → %s', (estado, esperado) => {
    expect(ticketSoloComentarios(estado, false)).toBe(esperado);
    expect(esEstadoSoloComentarios(estado)).toBe(esperado);
  });

  it.each([
    'NUEVO',
    'ASIGNADO',
    'EN_PROCESO',
    'ESPERANDO_CLIENTE',
    'RESUELTO',
    'CERRADO',
    'CANCELADO',
    'X',
  ])('ADMINISTRADOR o ROOT nunca queda en solo comentarios (%s, S3)', (estado) => {
    expect(ticketSoloComentarios(estado, true)).toBe(false);
  });
});
