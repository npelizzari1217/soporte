import * as util from 'util';
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

  describe('JSON.stringify() / inspección de Node (Judgment Day PR2 Ronda 2, issue B)', () => {
    it('JSON.stringify(email) no expone el valor crudo — usa el enmascarado vía toJSON()', () => {
      const email = Email.create('usuario@dominio.com').getValue();

      const serialized = JSON.stringify(email);

      expect(serialized).not.toContain('usuario@dominio.com');
      expect(serialized).toContain('u***@dominio.com');
    });

    it('JSON.stringify({ email }) tampoco expone el valor crudo cuando el VO está anidado', () => {
      const email = Email.create('usuario@dominio.com').getValue();

      const serialized = JSON.stringify({ email });

      expect(serialized).not.toContain('usuario@dominio.com');
      expect(serialized).toContain('u***@dominio.com');
    });

    it('util.inspect(email) (lo que usa console.log internamente) no expone el valor crudo', () => {
      const email = Email.create('usuario@dominio.com').getValue();

      const inspected = util.inspect(email);

      expect(inspected).not.toContain('usuario@dominio.com');
      expect(inspected).toContain('u***@dominio.com');
    });
  });

  describe('encapsulación real del valor crudo (Judgment Day PR2 Ronda 3, issue B)', () => {
    it('Object.keys(email) no expone ninguna propiedad enumerable con el valor crudo', () => {
      const email = Email.create('usuario@dominio.com').getValue();

      expect(Object.keys(email)).toHaveLength(0);
    });

    it('Object.values(email) no expone el valor crudo del email', () => {
      const email = Email.create('usuario@dominio.com').getValue();

      expect(Object.values(email)).not.toContain('usuario@dominio.com');
    });

    it('el spread ({ ...email }) no expone el valor crudo del email', () => {
      const email = Email.create('usuario@dominio.com').getValue();

      const spread = { ...email } as Record<string, unknown>;

      expect(Object.values(spread)).not.toContain('usuario@dominio.com');
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
