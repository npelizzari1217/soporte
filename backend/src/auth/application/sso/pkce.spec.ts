import { calcularCodeChallenge, generarAleatorioUrl, generarCodeVerifier, sha256Hex } from './pkce';

describe('pkce', () => {
  it('el desafio S256 coincide con el vector del apendice B de la RFC 7636', () => {
    expect(calcularCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('el verifier mide entre 43 y 128 caracteres y usa solo el alfabeto no reservado', () => {
    const verifier = generarCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it('dos generaciones difieren', () => {
    expect(generarCodeVerifier()).not.toBe(generarCodeVerifier());
    expect(generarAleatorioUrl()).not.toBe(generarAleatorioUrl());
  });

  it('sha256Hex es estable y coincide con el vector conocido', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
  });
});
