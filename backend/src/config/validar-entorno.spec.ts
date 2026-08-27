/**
 * validar-entorno.spec.ts — TDD RED phase (WU-1, sdd/fail-fast-env).
 *
 * Ref spec: REQ-1, REQ-2. Ref design: ADR-E3 capa 1 (pura).
 * Ref tasks: WU-1 1.1, 1.2.
 */
import {
  construirEntorno,
  ErrorEntornoInvalido,
  validarEntorno,
  VARIABLES_REQUERIDAS,
} from './validar-entorno';

const ENTORNO_COMPLETO = {
  DATABASE_URL_MASTER: 'postgresql://soporte:soporte@localhost:5432/soporte_master',
  APP_BASE_URL: 'http://localhost:5173',
  JWT_SECRET: 'valor-secreto-sensible',
};

describe('validarEntorno', () => {
  it('no reporta violaciones cuando las 3 variables requeridas están presentes', () => {
    expect(validarEntorno(ENTORNO_COMPLETO)).toEqual([]);
  });

  it.each(VARIABLES_REQUERIDAS.map((clave) => [clave] as const))(
    'reporta una violación cuando falta %s',
    (clave) => {
      const env = { ...ENTORNO_COMPLETO };
      delete (env as Record<string, string | undefined>)[clave];

      const violaciones = validarEntorno(env);

      expect(violaciones).toHaveLength(1);
      expect(violaciones[0].clave).toBe(clave);
    },
  );

  it('reporta una violación por cada variable faltante cuando faltan varias', () => {
    const env = { ...ENTORNO_COMPLETO };
    delete (env as Record<string, string | undefined>).DATABASE_URL_MASTER;
    delete (env as Record<string, string | undefined>).APP_BASE_URL;

    const violaciones = validarEntorno(env);

    expect(violaciones.map((v) => v.clave).sort()).toEqual(['APP_BASE_URL', 'DATABASE_URL_MASTER']);
  });

  it('trata una variable vacía como ausente', () => {
    const violaciones = validarEntorno({ ...ENTORNO_COMPLETO, APP_BASE_URL: '' });

    expect(violaciones).toHaveLength(1);
    expect(violaciones[0].clave).toBe('APP_BASE_URL');
  });

  it('trata una variable con solo espacios como ausente', () => {
    const violaciones = validarEntorno({ ...ENTORNO_COMPLETO, JWT_SECRET: '   ' });

    expect(violaciones).toHaveLength(1);
    expect(violaciones[0].clave).toBe('JWT_SECRET');
  });
});

describe('construirEntorno', () => {
  it('devuelve un objeto congelado con solo las 3 claves cuando el entorno está completo', () => {
    const entorno = construirEntorno({ ...ENTORNO_COMPLETO, OTRA_VARIABLE_CUALQUIERA: 'x' });

    expect(Object.isFrozen(entorno)).toBe(true);
    expect(Object.keys(entorno).sort()).toEqual(
      ['APP_BASE_URL', 'DATABASE_URL_MASTER', 'JWT_SECRET'].sort(),
    );
    expect(entorno).toEqual(ENTORNO_COMPLETO);
  });

  it('guarda el valor sin espacios al borde, para que no viaje al punto de consumo', () => {
    // `estaAusente` ya trimea para decidir presencia. Guardar el valor con el
    // padding intacto lo dejaba llegar hasta los links de los mails.
    const entorno = construirEntorno({
      ...ENTORNO_COMPLETO,
      APP_BASE_URL: '  http://localhost:5173  ',
    });

    expect(entorno.APP_BASE_URL).toBe('http://localhost:5173');
  });

  it('lanza ErrorEntornoInvalido nombrando TODAS las variables faltantes', () => {
    const env = { ...ENTORNO_COMPLETO };
    delete (env as Record<string, string | undefined>).DATABASE_URL_MASTER;
    delete (env as Record<string, string | undefined>).APP_BASE_URL;

    let error: unknown;
    try {
      construirEntorno(env);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(ErrorEntornoInvalido);
    const mensaje = (error as Error).message;
    expect(mensaje).toContain('DATABASE_URL_MASTER');
    expect(mensaje).toContain('APP_BASE_URL');
  });

  it('nombra la variable faltante pero NUNCA filtra el valor de otra variable sensible (JWT_SECRET)', () => {
    const env = { ...ENTORNO_COMPLETO };
    delete (env as Record<string, string | undefined>).APP_BASE_URL;

    let mensaje = '';
    try {
      construirEntorno(env);
    } catch (e) {
      mensaje = (e as Error).message;
    }

    expect(mensaje).toContain('APP_BASE_URL');
    expect(mensaje).not.toContain('valor-secreto-sensible');
  });
});
