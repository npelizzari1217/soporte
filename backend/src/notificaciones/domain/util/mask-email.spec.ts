/**
 * N1 [UNIT] — RED→GREEN: maskEmail — enmascarado de direcciones de email
 * para logs (N5, requisito transversal a todo el módulo notificaciones).
 *
 * Ref spec: sdd/premium/spec N5. Ref design: ADR-P8 ("enmascarado de PII").
 * Tarea: N1/N2.
 */
import { maskEmail } from './mask-email';

describe('maskEmail', () => {
  it('enmascara local y dominio preservando el TLD (formato j***@d***.com)', () => {
    expect(maskEmail('juan@dominio.com')).toBe('j***@d***.com');
  });

  it('enmascara un email con dominio de múltiples niveles preservando el resto', () => {
    expect(maskEmail('maria@correo.empresa.co')).toBe('m***@c***.empresa.co');
  });

  it('[CRITICAL] nunca devuelve el email completo en claro', () => {
    const email = 'sensible@secreto.com';
    expect(maskEmail(email)).not.toBe(email);
    expect(maskEmail(email)).not.toContain('sensible');
  });

  it('caso borde: sin "@" → "***"', () => {
    expect(maskEmail('no-es-un-email')).toBe('***');
  });

  it('caso borde: string vacío → "***"', () => {
    expect(maskEmail('')).toBe('***');
  });
});
