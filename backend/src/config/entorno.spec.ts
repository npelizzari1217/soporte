/**
 * entorno.spec.ts — TDD RED phase (WU-1, sdd/fail-fast-env).
 *
 * Ref spec: REQ-1. Ref design: ADR-E3 capa 2 (adaptador).
 * Ref tasks: WU-1 1.4, 1.5.
 *
 * Precedente vivo del patrón save/restore + vi.resetModules():
 * aes-gcm-secret-cipher.spec.ts:13-19.
 */
describe('entorno (adaptador)', () => {
  const original = {
    DATABASE_URL_MASTER: process.env.DATABASE_URL_MASTER,
    APP_BASE_URL: process.env.APP_BASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
  };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    for (const [clave, valor] of Object.entries(original)) {
      if (valor === undefined) {
        delete process.env[clave];
      } else {
        process.env[clave] = valor;
      }
    }
  });

  it('propaga el error del validador cuando falta APP_BASE_URL al importar el módulo', async () => {
    process.env.DATABASE_URL_MASTER = 'postgresql://soporte:soporte@localhost:5432/soporte_master';
    process.env.JWT_SECRET = 'jwt-secret-de-test';
    delete process.env.APP_BASE_URL;

    await expect(import('./entorno')).rejects.toThrow(/APP_BASE_URL/);
  });

  it('expone el entorno validado cuando las 3 variables están presentes', async () => {
    process.env.DATABASE_URL_MASTER = 'postgresql://soporte:soporte@localhost:5432/soporte_master';
    process.env.APP_BASE_URL = 'http://localhost:5173';
    process.env.JWT_SECRET = 'jwt-secret-de-test';

    const { entorno } = await import('./entorno');

    expect(entorno.APP_BASE_URL).toBe('http://localhost:5173');
  });
});
