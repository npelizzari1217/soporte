/**
 * Unitarios puros de `docker-postgres.mjs`. Nada de Docker ni Postgres
 * reales: `execFileSync` y la factory del cliente `pg` siempre vienen
 * inyectados por parámetro (ver design sdd/regeneracion-reproducible D4 y
 * la nota de W3 sobre no dejar que los tests esperen de verdad — `ahora` y
 * `dormir` también se inyectan para que el backoff/timeout de 90s nunca
 * corra reloj real).
 */
import {
  ErrorNombreContenedorInvalido,
  ErrorPostgresNoListo,
  clasificarErrorPostgres,
  esperarPostgresListo,
  inspeccionarContenedor,
  validarNombreContenedor,
  validarPuerto,
} from './docker-postgres.mjs';

/** Simula el error que lanza `execFileSync` cuando `docker inspect` sale con código ≠ 0. */
function errorDockerInspect({ status = 1, stdout = '[]\n', stderr = '' } = {}) {
  const error = new Error(`Command failed: docker inspect (status ${status})`);
  Object.assign(error, { status, stdout, stderr });
  return error;
}

describe('inspeccionarContenedor()', () => {
  it('reporta "corriendo" cuando el contenedor existe con la imagen esperada y está activo', () => {
    const execFileSyncFn = vi.fn(
      () => '[{"State":{"Running":true},"Config":{"Image":"postgres:16"}}]',
    );

    const resultado = inspeccionarContenedor({
      nombreContenedor: 'soporte-postgres-master',
      execFileSyncFn,
    });

    expect(resultado).toEqual({ estado: 'corriendo', imagen: 'postgres:16' });
    expect(execFileSyncFn).toHaveBeenCalledWith(
      'docker',
      ['inspect', 'soporte-postgres-master'],
      expect.objectContaining({ encoding: 'utf8' }),
    );
  });

  it('reporta "parado" cuando el contenedor existe con la imagen esperada pero no está corriendo', () => {
    const execFileSyncFn = vi.fn(
      () => '[{"State":{"Running":false},"Config":{"Image":"postgres:16"}}]',
    );

    const resultado = inspeccionarContenedor({
      nombreContenedor: 'soporte-postgres-master',
      execFileSyncFn,
    });

    expect(resultado).toEqual({ estado: 'parado', imagen: 'postgres:16' });
  });

  it('reporta "ausente" cuando docker inspect sale con código ≠ 0 y stdout "[]"', () => {
    const execFileSyncFn = vi.fn(() => {
      throw errorDockerInspect();
    });

    const resultado = inspeccionarContenedor({
      nombreContenedor: 'soporte-postgres-master',
      execFileSyncFn,
    });

    expect(resultado).toEqual({ estado: 'ausente', imagen: null });
  });

  it('reporta "otra-imagen" cuando el contenedor existe pero con una imagen distinta a la esperada', () => {
    const execFileSyncFn = vi.fn(
      () => '[{"State":{"Running":true},"Config":{"Image":"postgres:14"}}]',
    );

    const resultado = inspeccionarContenedor({
      nombreContenedor: 'soporte-postgres-master',
      imagenEsperada: 'postgres:16',
      execFileSyncFn,
    });

    expect(resultado).toEqual({ estado: 'otra-imagen', imagen: 'postgres:14' });
  });

  it('propaga un error de docker inspect que no corresponde a "ausente" (ej. daemon apagado)', () => {
    const errorDaemon = errorDockerInspect({
      status: 1,
      stdout: '',
      stderr: 'Cannot connect to the Docker daemon',
    });
    const execFileSyncFn = vi.fn(() => {
      throw errorDaemon;
    });

    let capturado;
    try {
      inspeccionarContenedor({ nombreContenedor: 'soporte-postgres-master', execFileSyncFn });
    } catch (error) {
      capturado = error;
    }

    // Se propaga el error TAL CUAL (no se lo re-envuelve): "ausente" y
    // "no pude ejecutar docker" son cosas distintas, y el mensaje real de
    // diagnóstico vive en `stderr`, no en `.message` de un error de
    // `child_process` (ese solo dice "Command failed").
    expect(capturado).toBe(errorDaemon);
    expect(capturado.stderr).toContain('Cannot connect to the Docker daemon');
  });
});

describe('inspeccionarContenedor() — AMENAZA: subprocesos (tarea 3.3)', () => {
  // Un test de amenaza que solo verifica que la función lanza no alcanza:
  // hay que probar que `execFileSyncFn` tiene CERO invocaciones. Si el
  // nombre malicioso llegara a `execFileSync` y fallara ahí adentro, este
  // test podría verse verde con la vulnerabilidad viva.
  it.each(['; rm -rf', '`whoami`', '$(id)', 'a&&b', '--privileged', ''])(
    'rechaza el nombre malicioso %j SIN invocar nunca a execFileSync',
    (nombreMalicioso) => {
      const execFileSyncFn = vi.fn();

      expect(() =>
        inspeccionarContenedor({ nombreContenedor: nombreMalicioso, execFileSyncFn }),
      ).toThrow(ErrorNombreContenedorInvalido);

      expect(execFileSyncFn).not.toHaveBeenCalled();
    },
  );
});

describe('validarNombreContenedor()', () => {
  it.each(['soporte-postgres-master', 'ab', 'a1', 'a_b.c-d', 'soporte-postgres-regen'])(
    'acepta el nombre válido: %s',
    (nombre) => {
      expect(validarNombreContenedor(nombre)).toBe(true);
    },
  );

  it.each([
    '; rm -rf',
    '`whoami`',
    '$(id)',
    'a&&b',
    '--privileged',
    '',
    '-abc',
    '.abc',
    'a b',
    null,
    undefined,
  ])('rechaza el nombre inválido: %j', (nombre) => {
    expect(validarNombreContenedor(nombre)).toBe(false);
  });
});

describe('validarPuerto()', () => {
  it.each([1024, 5432, 5433, 65535])('acepta el puerto válido: %s', (puerto) => {
    expect(validarPuerto(puerto)).toBe(true);
  });

  it.each([1023, 65536, 0, -1, 3.5, 'abc', null, undefined])(
    'rechaza el puerto inválido: %j',
    (puerto) => {
      expect(validarPuerto(puerto)).toBe(false);
    },
  );
});

describe('clasificarErrorPostgres()', () => {
  it.each(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '57P03'])(
    'clasifica %s como reintentable',
    (codigo) => {
      expect(clasificarErrorPostgres({ code: codigo })).toBe('reintentable');
    },
  );

  it.each(['28P01', '28000'])('clasifica %s como fatal', (codigo) => {
    expect(clasificarErrorPostgres({ code: codigo })).toBe('fatal');
  });

  it('un código desconocido se trata como reintentable (la lista fatal es cerrada, ver D4)', () => {
    expect(clasificarErrorPostgres({ code: 'ALGO_NUEVO' })).toBe('reintentable');
  });
});

/** Cliente `pg` fake mínimo: connect/query/end como espías controlables. */
function clienteFake({
  connect = vi.fn(async () => undefined),
  query = vi.fn(async () => undefined),
} = {}) {
  return { connect, query, end: vi.fn(async () => undefined) };
}

describe('esperarPostgresListo()', () => {
  it('reintenta ante ECONNREFUSED y da listo cuando el intento siguiente conecta', async () => {
    const errorReintentable = Object.assign(new Error('conexión rechazada'), {
      code: 'ECONNREFUSED',
    });
    let intento = 0;
    const crearCliente = vi.fn(() => {
      intento += 1;
      if (intento === 1)
        return clienteFake({
          connect: vi.fn(async () => {
            throw errorReintentable;
          }),
        });
      return clienteFake();
    });

    const resultado = await esperarPostgresListo({
      crearCliente,
      timeoutMs: 10_000,
      dormir: vi.fn(async () => undefined),
      ahora: vi.fn(() => 0),
    });

    expect(resultado).toEqual({ listo: true, intentos: 2 });
    expect(crearCliente).toHaveBeenCalledTimes(2);
  });

  it('reintenta ante SQLSTATE 57P03 (the database system is starting up)', async () => {
    const errorArrancando = Object.assign(new Error('the database system is starting up'), {
      code: '57P03',
    });
    let intento = 0;
    const crearCliente = vi.fn(() => {
      intento += 1;
      if (intento === 1)
        return clienteFake({
          connect: vi.fn(async () => {
            throw errorArrancando;
          }),
        });
      return clienteFake();
    });

    const resultado = await esperarPostgresListo({
      crearCliente,
      timeoutMs: 10_000,
      dormir: vi.fn(async () => undefined),
      ahora: vi.fn(() => 0),
    });

    expect(resultado).toEqual({ listo: true, intentos: 2 });
  });

  it('[CRITICAL] 28P01 (autenticación fallida) corta en el PRIMER intento — nunca reintenta', async () => {
    const errorAuth = Object.assign(new Error('password authentication failed'), { code: '28P01' });
    const crearCliente = vi.fn(() =>
      clienteFake({
        connect: vi.fn(async () => {
          throw errorAuth;
        }),
      }),
    );
    const dormir = vi.fn(async () => undefined);
    // Reloj que AVANZA en cada llamada (nunca queda congelado en 0): si una
    // regresión futura hiciera que 28P01 se clasifique como reintentable,
    // este test debe FALLAR con una aserción clara (más intentos de los
    // esperados) en vez de colgarse en un `while` infinito con el reloj
    // frenado — eso ya pasó al mutar `clasificarErrorPostgres` durante la
    // verificación de este work unit y tumbó el proceso por OOM.
    let tiempo = 0;
    const ahora = vi.fn(() => {
      tiempo += 1000;
      return tiempo;
    });

    await expect(
      esperarPostgresListo({
        crearCliente,
        timeoutMs: 90_000,
        dormir,
        ahora,
      }),
    ).rejects.toBeInstanceOf(ErrorPostgresNoListo);

    // La prueba real de "no reintenta 90 segundos ante una contraseña
    // equivocada": la factory del cliente se invoca UNA sola vez, y jamás
    // se llama a `dormir` (no hay backoff antes de cortar).
    expect(crearCliente).toHaveBeenCalledTimes(1);
    expect(dormir).not.toHaveBeenCalled();
  });

  it('agota el deadline sin esperar de verdad (reloj inyectado) y lanza ErrorPostgresNoListo', async () => {
    const errorReintentable = Object.assign(new Error('conexión rechazada'), {
      code: 'ECONNREFUSED',
    });
    const crearCliente = vi.fn(() =>
      clienteFake({
        connect: vi.fn(async () => {
          throw errorReintentable;
        }),
      }),
    );
    // deadline = ahora() + timeoutMs = 0 + 1000 = 1000. Primer chequeo del
    // while (500) sigue adentro; segundo chequeo (1500) ya lo superó.
    const ahora = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(500).mockReturnValueOnce(1500);
    const dormir = vi.fn(async () => undefined);

    await expect(
      esperarPostgresListo({ crearCliente, timeoutMs: 1000, dormir, ahora }),
    ).rejects.toBeInstanceOf(ErrorPostgresNoListo);

    expect(crearCliente).toHaveBeenCalledTimes(1);
  });
});
