/**
 * Unitarios puros de `guardarrail-host.mjs`: solo literales, nunca
 * `process.env` ni un socket real (ver design sdd/regeneracion-reproducible
 * D2 capa 1). La corrida entera de Vitest ya pasó por el `globalSetup` que
 * usa este mismo módulo — acá no hay recursión porque la entrada de estos
 * tests nunca viene del entorno, siempre de literales.
 */
import {
  ErrorHostNoLocal,
  asegurarHostLocal,
  esHostLocal,
  redactarUrl,
} from './guardarrail-host.mjs';

describe('esHostLocal()', () => {
  it.each([
    ['localhost', true],
    ['127.0.0.1', true],
    ['::1', true],
    ['[::1]', true],
    ['10.0.0.5', false],
    ['ejemplo.com', false],
    ['192.168.1.10', false],
  ])('%s -> %s', (host, esperado) => {
    expect(esHostLocal(host)).toBe(esperado);
  });
});

describe('asegurarHostLocal()', () => {
  it.each([
    'postgresql://usuario:clave@localhost:5432/db',
    'postgresql://usuario:clave@127.0.0.1:5432/db',
    'postgresql://usuario:clave@[::1]:5432/db',
  ])('no lanza para host local: %s', (url) => {
    expect(() => asegurarHostLocal(url, 'test')).not.toThrow();
  });

  it('lanza ErrorHostNoLocal nombrando el host y el contexto para un host remoto', () => {
    const url = 'postgresql://usuario:clave@10.0.0.5:5432/db_remota';

    let capturado: unknown;
    try {
      asegurarHostLocal(url, 'DATABASE_URL_MASTER (sesión de shell)');
    } catch (error) {
      capturado = error;
    }

    expect(capturado).toBeInstanceOf(ErrorHostNoLocal);
    const error = capturado as InstanceType<typeof ErrorHostNoLocal>;
    expect(error.message).toContain('10.0.0.5');
    expect(error.message).toContain('DATABASE_URL_MASTER (sesión de shell)');
  });

  it.each(['no-es-una-url', 'postgresql://', ''])(
    'falla cerrado ante una URL inválida: %s',
    (url) => {
      expect(() => asegurarHostLocal(url, 'test')).toThrow(ErrorHostNoLocal);
    },
  );
});

describe('asegurarHostLocal() — sin escape hatch', () => {
  // Esto prueba la AUSENCIA de un mecanismo, no un valor de host: la función
  // ni siquiera lee `process.env`, así que ningún nombre de variable puede
  // desarmar el freno. Se setean estas variables ANTES de invocar la
  // función con una URL remota, y se restauran después para no filtrar
  // estado entre tests.
  const URL_REMOTA = 'postgresql://usuario:clave@10.0.0.5:5432/db_remota';
  const NOMBRES_DE_ESCAPE_HATCH = [
    'PERMITIR_HOST_REMOTO',
    'SKIP_GUARDARRAIL',
    'ALLOW_REMOTE_DB',
    'GUARDARRAIL_HOST_DISABLED',
    'NO_GUARDARRAIL',
    'DATABASE_URL_MASTER_UNSAFE',
  ];

  it.each(NOMBRES_DE_ESCAPE_HATCH)(
    'sigue abortando aunque process.env.%s esté seteado',
    (nombreVariable) => {
      const valorOriginal = process.env[nombreVariable];
      process.env[nombreVariable] = 'true';

      try {
        expect(() => asegurarHostLocal(URL_REMOTA, 'test')).toThrow(ErrorHostNoLocal);
      } finally {
        if (valorOriginal === undefined) delete process.env[nombreVariable];
        else process.env[nombreVariable] = valorOriginal;
      }
    },
  );

  it('ninguna combinación de las variables de arriba, todas juntas, desarma el freno', () => {
    const originales = new Map(NOMBRES_DE_ESCAPE_HATCH.map((n) => [n, process.env[n]]));
    for (const nombre of NOMBRES_DE_ESCAPE_HATCH) process.env[nombre] = 'true';

    try {
      expect(() => asegurarHostLocal(URL_REMOTA, 'test')).toThrow(ErrorHostNoLocal);
    } finally {
      for (const [nombre, valor] of originales) {
        if (valor === undefined) delete process.env[nombre];
        else process.env[nombre] = valor;
      }
    }
  });
});

describe('redactarUrl()', () => {
  it('reemplaza la contraseña por *** sin tocar el resto de la URL', () => {
    const redactada = redactarUrl('postgresql://usuario:secreto123@localhost:5432/db');

    expect(redactada).not.toContain('secreto123');
    expect(redactada).toContain('usuario');
    expect(redactada).toContain('localhost');
  });

  it('no explota ante una URL inválida: devuelve un texto de reemplazo', () => {
    expect(() => redactarUrl('no-es-una-url')).not.toThrow();
  });
});
