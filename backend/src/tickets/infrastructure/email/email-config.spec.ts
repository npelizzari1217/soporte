/**
 * 2.9 — RED: loadEmailConfig() lanza al bootstrap si falta env SMTP.
 *
 * Config SMTP se valida al bootstrap (falla el arranque, NO un send()
 * individual) — Requirement 7 nota infra; NFR "cero config SMTP fuera de
 * infra" (esta validación vive exclusivamente en infrastructure/).
 *
 * Ref tasks: PR2 2.9
 */
import { loadEmailConfig } from './email-config';

function buildEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    SMTP_HOST: 'smtp.dominio.com',
    SMTP_PORT: '587',
    SMTP_USER: 'no-reply@dominio.com',
    SMTP_PASS: 'super-secreto',
    SMTP_FROM: 'Soporte <no-reply@dominio.com>',
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe('loadEmailConfig()', () => {
  it('retorna la config parseada cuando todas las variables SMTP están presentes', () => {
    const config = loadEmailConfig(buildEnv());

    expect(config).toEqual({
      host: 'smtp.dominio.com',
      port: 587,
      secure: false,
      user: 'no-reply@dominio.com',
      pass: 'super-secreto',
      from: 'Soporte <no-reply@dominio.com>',
    });
  });

  it('SMTP_SECURE=true se parsea como boolean true', () => {
    const config = loadEmailConfig(buildEnv({ SMTP_SECURE: 'true' }));

    expect(config.secure).toBe(true);
  });

  it('lanza si falta SMTP_HOST', () => {
    const env = buildEnv();
    delete env.SMTP_HOST;

    expect(() => loadEmailConfig(env)).toThrow(/SMTP_HOST/);
  });

  it('lanza si falta SMTP_USER y SMTP_PASS (lista ambas variables faltantes)', () => {
    const env = buildEnv();
    delete env.SMTP_USER;
    delete env.SMTP_PASS;

    expect(() => loadEmailConfig(env)).toThrow(/SMTP_USER.*SMTP_PASS|SMTP_PASS.*SMTP_USER/);
  });

  it('lanza si SMTP_PORT no es numérico', () => {
    const env = buildEnv({ SMTP_PORT: 'no-es-un-numero' });

    expect(() => loadEmailConfig(env)).toThrow(/SMTP_PORT/);
  });
});
