import { maskEmailLike, maskEmailsInText } from './mask-email-like';

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

/**
 * Judgment Day PR3 Ronda 3 (issue 2) — `maskEmailsInText()` solo tenía
 * cobertura indirecta vía `sanitizeCausa()`/el listener. Estos casos cubren
 * la función pura en aislamiento: passthrough sin emails, un email embebido,
 * múltiples emails, y el caso de dominio de una sola etiqueta (issue 3).
 */
describe('maskEmailsInText()', () => {
  it('deja el texto intacto cuando no contiene ningún email', () => {
    const texto = 'Error de conexión: timeout esperando respuesta del servidor';
    expect(maskEmailsInText(texto)).toBe(texto);
  });

  it('enmascara un único email embebido preservando el resto del texto intacto', () => {
    const texto = 'Rechazado: usuario@dominio.com no existe';
    expect(maskEmailsInText(texto)).toBe('Rechazado: u***@dominio.com no existe');
  });

  it('enmascara TODOS los emails cuando hay múltiples en el mismo texto', () => {
    const texto = 'De: a@dominio.com Para: b@otro.com';
    expect(maskEmailsInText(texto)).toBe('De: a***@dominio.com Para: b***@otro.com');
  });

  it('enmascara un email con dominio de una sola etiqueta sin punto (ej. user@localhost)', () => {
    const texto = '550 5.1.1 <user@localhost>: Recipient address rejected: User unknown';
    expect(maskEmailsInText(texto)).toBe(
      '550 5.1.1 <u***@localhost>: Recipient address rejected: User unknown',
    );
  });
});
