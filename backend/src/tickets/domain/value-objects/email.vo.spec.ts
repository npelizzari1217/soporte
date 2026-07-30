import { Email } from './email.vo';
import { EmailError } from '../errors/email.errors';

/**
 * 2.1 — RED: Email.create() válido/inválido, mask(), equals().
 *
 * Ref design: D8, tabla testing "VO Email".
 * Ref tasks: PR2 2.1
 */
describe('Email (VO)', () => {
  describe('create()', () => {
    it('crea un Email válido a partir de un string bien formado', () => {
      const result = Email.create('usuario@dominio.com');

      expect(result.isOk()).toBe(true);
      expect(result.getValue().value()).toBe('usuario@dominio.com');
    });

    it('recorta espacios en blanco antes de validar', () => {
      const result = Email.create('  usuario@dominio.com  ');

      expect(result.isOk()).toBe(true);
      expect(result.getValue().value()).toBe('usuario@dominio.com');
    });

    it('falla con EmailError(EMAIL_INVALIDO) cuando el string está vacío', () => {
      const result = Email.create('');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(EmailError);
      expect(result.getError().code).toBe('EMAIL_INVALIDO');
    });

    it('falla con EmailError(EMAIL_INVALIDO) cuando falta el @', () => {
      const result = Email.create('no-es-un-email');

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('EMAIL_INVALIDO');
    });

    it('falla con EmailError(EMAIL_INVALIDO) cuando falta el dominio con punto', () => {
      const result = Email.create('usuario@dominio');

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('EMAIL_INVALIDO');
    });

    it('el error de creación nunca expone el email completo en claro', () => {
      const raw = 'secreto@@dominio-invalido';
      const result = Email.create(raw);

      expect(result.isFail()).toBe(true);
      expect(result.getError().destinatarioEnmascarado).not.toBe(raw);
    });
  });

  describe('mask()', () => {
    it('enmascara dejando visible solo el primer caracter local y el dominio completo', () => {
      const email = Email.create('usuario@dominio.com').getValue();

      expect(email.mask()).toBe('u***@dominio.com');
    });
  });

  describe('toString()', () => {
    it('delega en mask() para no filtrar el email completo por interpolación implícita', () => {
      const email = Email.create('usuario@dominio.com').getValue();

      expect(email.toString()).toBe(email.mask());
      expect(email.toString()).toBe('u***@dominio.com');
    });
  });

  describe('equals()', () => {
    it('retorna true para dos Email con el mismo valor', () => {
      const a = Email.create('usuario@dominio.com').getValue();
      const b = Email.create('usuario@dominio.com').getValue();

      expect(a.equals(b)).toBe(true);
    });

    it('retorna false para Email con valores distintos', () => {
      const a = Email.create('usuario@dominio.com').getValue();
      const b = Email.create('otro@dominio.com').getValue();

      expect(a.equals(b)).toBe(false);
    });
  });
});
