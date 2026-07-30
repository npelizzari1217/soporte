/**
 * 2.1 — RED: `SmtpConfig.create()` — completa ⇒ `Result.ok`; falta campo o
 * `port` no numérico ⇒ `Result.fail(ConfigIncompletaError)` (Dz5).
 *
 * Incluye además la cobertura de masking (spec R2 "el secreto en claro nunca
 * aparece fuera de memoria"): `toSafeLog()`, `JSON.stringify()` y
 * `util.inspect()`/`console.log` NUNCA exponen `pass` en claro — mismo
 * patrón de defensa que `Email` VO (`toJSON`/`inspect.custom`).
 *
 * Ref spec: Requirement 1 "config incompleta", Requirement 2 "secreto nunca
 * fuera de memoria". Ref design: §5 Dz5, §5.1.
 * Ref tasks: PR2 2.1.
 */
import { SmtpConfig } from './smtp-config.vo';
import { ConfigIncompletaError } from '../errors/config-incompleta.error';

const CONFIG_COMPLETA = {
  host: 'smtp.dominio.com',
  port: 587,
  secure: true,
  user: 'usuario@dominio.com',
  pass: 'super-secreto-123',
  from: 'no-reply@dominio.com',
};

describe('SmtpConfig', () => {
  describe('create()', () => {
    it('retorna Result.ok cuando todos los campos requeridos están presentes y son válidos', () => {
      const result = SmtpConfig.create(CONFIG_COMPLETA);

      expect(result.isOk()).toBe(true);
      const config = result.getValue();
      expect(config.host).toBe('smtp.dominio.com');
      expect(config.port).toBe(587);
      expect(config.secure).toBe(true);
      expect(config.user).toBe('usuario@dominio.com');
      expect(config.pass).toBe('super-secreto-123');
      expect(config.from).toBe('no-reply@dominio.com');
    });

    it('acepta `port` y `secure` como strings numéricas/booleanas (valores crudos de ConfiguracionRuntime.valor)', () => {
      const result = SmtpConfig.create({
        ...CONFIG_COMPLETA,
        port: '587',
        secure: 'true',
      });

      expect(result.isOk()).toBe(true);
      const config = result.getValue();
      expect(config.port).toBe(587);
      expect(config.secure).toBe(true);
    });

    it.each(['host', 'port', 'secure', 'user', 'pass', 'from'] as const)(
      'retorna Result.fail(ConfigIncompletaError) cuando falta el campo requerido "%s"',
      (campoFaltante) => {
        const raw = { ...CONFIG_COMPLETA };
        delete (raw as Record<string, unknown>)[campoFaltante];

        const result = SmtpConfig.create(raw);

        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(ConfigIncompletaError);
        expect(result.getError().code).toBe('CONFIG_INCOMPLETA');
      },
    );

    it('retorna Result.fail(ConfigIncompletaError) cuando `port` no es numérico', () => {
      const result = SmtpConfig.create({ ...CONFIG_COMPLETA, port: 'no-es-un-numero' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ConfigIncompletaError);
      expect(result.getError().code).toBe('CONFIG_INCOMPLETA');
    });

    it('retorna Result.fail(ConfigIncompletaError) cuando `secure` no es un booleano reconocible', () => {
      const result = SmtpConfig.create({ ...CONFIG_COMPLETA, secure: 'tal-vez' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ConfigIncompletaError);
    });

    it('nunca lanza excepción ante un input completamente vacío', () => {
      expect(() => SmtpConfig.create({})).not.toThrow();
      const result = SmtpConfig.create({});
      expect(result.isFail()).toBe(true);
    });

    it.each([0, -1, -25, 65536, 100000, 1.5])(
      'retorna Result.fail(ConfigIncompletaError) cuando `port` está fuera de rango 1-65535 (%s)',
      (portInvalido) => {
        const result = SmtpConfig.create({ ...CONFIG_COMPLETA, port: portInvalido });

        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(ConfigIncompletaError);
        expect(result.getError().code).toBe('CONFIG_INCOMPLETA');
      },
    );

    it.each([1, 587, 65535])(
      'acepta `port` en los bordes del rango válido 1-65535 (%s)',
      (portValido) => {
        const result = SmtpConfig.create({ ...CONFIG_COMPLETA, port: portValido });

        expect(result.isOk()).toBe(true);
        expect(result.getValue().port).toBe(portValido);
      },
    );
  });

  describe('equals()', () => {
    it('retorna true cuando los 6 campos son iguales', () => {
      const a = SmtpConfig.create(CONFIG_COMPLETA).getValue();
      const b = SmtpConfig.create({ ...CONFIG_COMPLETA }).getValue();

      expect(a.equals(b)).toBe(true);
    });

    it.each(['host', 'port', 'secure', 'user', 'pass', 'from'] as const)(
      'retorna false cuando difiere el campo "%s"',
      (campo) => {
        const a = SmtpConfig.create(CONFIG_COMPLETA).getValue();
        const distinto: Record<string, unknown> = {
          host: 'otro.smtp.com',
          port: 2525,
          secure: false,
          user: 'otro-usuario',
          pass: 'otro-secreto',
          from: 'otro@dominio.com',
        };
        const b = SmtpConfig.create({ ...CONFIG_COMPLETA, [campo]: distinto[campo] }).getValue();

        expect(a.equals(b)).toBe(false);
      },
    );
  });

  describe('toString()', () => {
    it('NUNCA expone el `pass` en claro, ni por interpolación implícita', () => {
      const config = SmtpConfig.create(CONFIG_COMPLETA).getValue();

      const interpolado = `${config}`;

      expect(interpolado).not.toContain('super-secreto-123');
      expect(interpolado).toContain('********');
      expect(interpolado).toContain('smtp.dominio.com');
    });

    it('String(config) devuelve la representación enmascarada', () => {
      const config = SmtpConfig.create(CONFIG_COMPLETA).getValue();

      expect(String(config)).toBe(config.toString());
      expect(config.toString()).not.toContain('super-secreto-123');
    });
  });

  describe('masking del secreto (`pass`)', () => {
    it('toSafeLog() enmascara `pass` y expone el resto de campos reales', () => {
      const config = SmtpConfig.create(CONFIG_COMPLETA).getValue();

      const safe = config.toSafeLog();

      expect(safe.pass).toBe('********');
      expect(safe.host).toBe('smtp.dominio.com');
      expect(safe.port).toBe(587);
      expect(safe.secure).toBe(true);
      expect(safe.user).toBe('usuario@dominio.com');
      expect(safe.from).toBe('no-reply@dominio.com');
    });

    it('JSON.stringify() NUNCA expone el `pass` en claro', () => {
      const config = SmtpConfig.create(CONFIG_COMPLETA).getValue();

      const serialized = JSON.stringify({ config });

      expect(serialized).not.toContain('super-secreto-123');
      expect(serialized).toContain('********');
    });

    it('util.inspect()/console.log NUNCA expone el `pass` en claro', async () => {
      const { inspect } = await import('node:util');
      const config = SmtpConfig.create(CONFIG_COMPLETA).getValue();

      const inspected = inspect(config);

      expect(inspected).not.toContain('super-secreto-123');
    });
  });
});
