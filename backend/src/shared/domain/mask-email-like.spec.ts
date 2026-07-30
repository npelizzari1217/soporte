import { maskEmailLike } from './mask-email-like';

/**
 * Judgment Day PR2 Ronda 2 (issue C) — cobertura unitaria directa del
 * algoritmo de enmascarado extraído de `Email.maskRaw()` (ahora eliminado
 * del VO). Los tests de `Email.mask()` y `sanitizeCausa()` siguen
 * cubriendo el comportamiento end-to-end en sus respectivos consumidores;
 * este spec cubre la función pura en aislamiento.
 */
describe('maskEmailLike()', () => {
  it('enmascara dejando visible solo el primer caracter local y el dominio completo', () => {
    expect(maskEmailLike('usuario@dominio.com')).toBe('u***@dominio.com');
  });

  it('retorna "(vacío)" para un string vacío', () => {
    expect(maskEmailLike('')).toBe('(vacío)');
  });

  it('enmascara un string sin "@" válido (arroba al inicio o ausente) mostrando solo el primer caracter', () => {
    expect(maskEmailLike('no-es-un-email')).toBe('n***');
    expect(maskEmailLike('@dominio.com')).toBe('@***');
  });
});
