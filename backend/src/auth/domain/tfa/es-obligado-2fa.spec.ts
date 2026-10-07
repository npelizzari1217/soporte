import { esObligado2fa } from './es-obligado-2fa';

const m = (clienteRequiere2fa: boolean, activa = true) => ({ clienteRequiere2fa, activa });

describe('esObligado2fa (L3)', () => {
  it('ROOT siempre esta obligado', () => {
    expect(esObligado2fa(true, [])).toBe(true);
  });

  it('una membresia activa cuyo cliente exige 2FA obliga, aunque otra no', () => {
    expect(esObligado2fa(false, [m(false), m(true)])).toBe(true);
  });

  it('dos clientes sin politica no obligan (mutacion some -> every lo pondria en rojo en el caso anterior)', () => {
    expect(esObligado2fa(false, [m(false), m(false)])).toBe(false);
  });

  it('sin membresias y sin ROOT no obliga', () => {
    expect(esObligado2fa(false, [])).toBe(false);
  });

  it('una membresia inactiva no cuenta aunque su cliente exija 2FA', () => {
    expect(esObligado2fa(false, [m(true, false)])).toBe(false);
  });

  it('sin `activa` la membresia cuenta como activa: lo desconocido obliga, nunca libera', () => {
    expect(esObligado2fa(false, [{ clienteRequiere2fa: true }])).toBe(true);
  });
});
