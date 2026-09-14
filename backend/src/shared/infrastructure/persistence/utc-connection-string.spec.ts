/**
 * utc-connection-string.spec.ts — unit, sin base (WU1, sdd/sesion-utc-y-backfill-de-fechas).
 *
 * `agregarTimezoneUtc` es una transformación de string pura: ningún caso acá
 * toca una conexión real. `conUtc` construye un `pg.Pool`, pero `pg.Pool` es
 * lazy (no abre TCP al construirse) — el único assert posible y correcto acá
 * es sobre su config (`pool.options.connectionString`), nunca sobre I/O.
 *
 * Ref spec: sdd/sesion-utc-y-backfill-de-fechas §"Round-trip de fecha
 * correcto en sesión no-UTC". Ref design: ADR-1. Tarea: 1.3.
 */
import { agregarTimezoneUtc, conUtc } from './utc-connection-string';

describe('agregarTimezoneUtc', () => {
  it('agrega options=-c TimeZone=UTC preservando usuario, clave, host, puerto y DB', () => {
    const resultado = agregarTimezoneUtc('postgresql://usuario:clave@localhost:5432/basededatos');
    const parsed = new URL(resultado);

    expect(parsed.username).toBe('usuario');
    expect(parsed.password).toBe('clave');
    expect(parsed.hostname).toBe('localhost');
    expect(parsed.port).toBe('5432');
    expect(parsed.pathname).toBe('/basededatos');
    expect(parsed.searchParams.get('options')).toBe('-c TimeZone=UTC');
  });

  it('preserva un query param previo distinto de `options`', () => {
    const resultado = agregarTimezoneUtc('postgresql://u:p@host:5432/db?sslmode=require');
    const parsed = new URL(resultado);

    expect(parsed.searchParams.get('sslmode')).toBe('require');
    expect(parsed.searchParams.get('options')).toBe('-c TimeZone=UTC');
  });

  it('appendea al `options` previo en vez de pisarlo (libpq admite múltiples -c)', () => {
    const conOptionsPrevio = new URL('postgresql://u:p@host:5432/db');
    conOptionsPrevio.searchParams.set('options', '-c search_path=foo');

    const resultado = agregarTimezoneUtc(conOptionsPrevio.toString());
    const parsed = new URL(resultado);

    expect(parsed.searchParams.get('options')).toBe('-c search_path=foo -c TimeZone=UTC');
  });

  it('es idempotente: aplicarla dos veces no duplica el flag', () => {
    const primeraVez = agregarTimezoneUtc('postgresql://u:p@host:5432/db');
    const segundaVez = agregarTimezoneUtc(primeraVez);

    expect(segundaVez).toBe(primeraVez);
    expect(new URL(segundaVez).searchParams.get('options')).toBe('-c TimeZone=UTC');
  });

  it('no duplica el flag si ya estaba presente junto a otro `-c` (idempotencia con options previo)', () => {
    const url = new URL('postgresql://u:p@host:5432/db');
    url.searchParams.set('options', '-c search_path=foo -c TimeZone=UTC');

    const resultado = agregarTimezoneUtc(url.toString());

    expect(new URL(resultado).searchParams.get('options')).toBe(
      '-c search_path=foo -c TimeZone=UTC',
    );
  });
});

describe('conUtc', () => {
  it('construye un Pool cuya connectionString trae options=-c TimeZone=UTC, sin abrir conexión', () => {
    const pool = conUtc('postgresql://usuario:clave@localhost:5432/basededatos');

    expect(pool.options.connectionString).toBeDefined();
    const parsed = new URL(pool.options.connectionString as string);
    expect(parsed.searchParams.get('options')).toBe('-c TimeZone=UTC');
    expect(parsed.pathname).toBe('/basededatos');

    // pg.Pool es lazy: no se abrió ninguna conexión TCP en este test, así
    // que no hay nada que esperar antes de end() (no se conectó ningún cliente).
    void pool.end();
  });

  it('propaga config adicional de Pool (ej. max) junto con la connectionString aumentada', () => {
    const pool = conUtc('postgresql://usuario:clave@localhost:5432/basededatos', { max: 3 });

    expect(pool.options.max).toBe(3);
    expect(new URL(pool.options.connectionString as string).searchParams.get('options')).toBe(
      '-c TimeZone=UTC',
    );

    void pool.end();
  });
});
