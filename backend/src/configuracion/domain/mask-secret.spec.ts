/**
 * 3.1 — RED: `maskIfSecret` — única fuente de verdad del enmascarado de
 * valores `esSecreto=true` usados en el evento `ConfiguracionCambiada` y en
 * `AuditEntry` (Dz7). El REQUISITO DURO documentado en STATE.md ("Judgment
 * Day — PR1 — fixes Ronda 2", fix #6) es que `audit_entries` NUNCA persista
 * el plaintext de un secreto — este helper es el guard central que lo
 * garantiza en el origen (write use case, PR4) antes de que el valor llegue
 * al evento/al audit.
 *
 * Ref design: §5.1 (única fuente de verdad del masking). Ref spec: R5.
 * Ref tasks: PR3 3.1.
 */
import { maskIfSecret, SECRET_MASK } from './mask-secret';

describe('maskIfSecret', () => {
  it('expone SECRET_MASK como "********"', () => {
    expect(SECRET_MASK).toBe('********');
  });

  it('enmascara el valor cuando esSecreto=true', () => {
    expect(maskIfSecret('super-secreto-en-claro', true)).toBe(SECRET_MASK);
  });

  it('NUNCA retorna el plaintext original cuando esSecreto=true', () => {
    const plaintext = 'password-real-123';
    const resultado = maskIfSecret(plaintext, true);

    expect(resultado).not.toBe(plaintext);
    expect(resultado).not.toContain(plaintext);
  });

  it('retorna null cuando esSecreto=true pero el valor es null (sin fila previa)', () => {
    expect(maskIfSecret(null, true)).toBeNull();
  });

  it('retorna el valor real sin modificar cuando esSecreto=false', () => {
    expect(maskIfSecret('smtp.dominio.com', false)).toBe('smtp.dominio.com');
  });

  it('retorna null cuando esSecreto=false y el valor es null', () => {
    expect(maskIfSecret(null, false)).toBeNull();
  });

  it('enmascara un secreto vacío (string "") — un valor vacío no deja de ser secreto', () => {
    expect(maskIfSecret('', true)).toBe(SECRET_MASK);
  });

  it('es idempotente: re-enmascarar un valor ya enmascarado (SECRET_MASK) da el mismo SECRET_MASK', () => {
    expect(maskIfSecret(SECRET_MASK, true)).toBe(SECRET_MASK);
  });
});
