/**
 * Acciones por tipo de una clave de API v1 (odd/permisos-por-tipo-ticket, D5 f, L50.3). La clave no
 * tiene filas por tipo y conserva su vocabulario de módulo: sus celdas se traducen con una tabla
 * propia, que da lo mismo que daba la traducción de L11 para toda celda que una clave puede llevar.
 * Desde T9c esa traducción no existe: lo esperado por cada celda queda escrito acá.
 */
import { AccionTipoTicket } from '../../tickets/domain/permisos-tipo-ticket';
import { accionesDeClaveApi, accionesDeClaveApiParaComentar } from './alcance-clave-api';
import { PERMISOS_API } from './api-clave';

/** Todas las combinaciones de celdas que puede llevar una clave. */
function subconjuntos(valores: readonly string[]): string[][] {
  return valores.reduce<string[][]>(
    (acumulado, valor) => [...acumulado, ...acumulado.map((parcial) => [...parcial, valor])],
    [[]],
  );
}

/** Las celdas tal como las deja `ApiClaveGuard`: con lectura, también ver todos. */
function comoLasDejaElGuard(celdas: readonly string[]): string[] {
  return celdas.includes('TICKETS:LECTURA') ? [...celdas, 'TICKETS:VER_TODOS'] : [...celdas];
}

/** Lo que daba la traducción de L11 por cada celda de clave, con el VER_TODOS que agrega el guard. */
const ESPERADAS_POR_CELDA: Readonly<Record<string, readonly AccionTipoTicket[]>> = {
  'TICKETS:LECTURA': ['LECTURA', 'VER_TODOS', 'IMPRESION'],
  'TICKETS:ALTAS': ['ALTAS'],
  'TICKETS:COMENTAR': ['COMENTAR'],
};

describe('accionesDeClaveApi', () => {
  it.each(subconjuntos(PERMISOS_API).map((celdas) => [celdas.join(' + ') || 'ninguna', celdas]))(
    'con las celdas %s da sobre un tipo de TICKETS la unión de lo que da cada una',
    (_nombre: string, celdas: string[]) => {
      const esperadas = new Set(celdas.flatMap((celda) => ESPERADAS_POR_CELDA[celda] ?? []));
      expect(accionesDeClaveApi(comoLasDejaElGuard(celdas), 'TICKETS')).toEqual(esperadas);
    },
  );

  it('una clave de lectura ve todos los tickets del tipo e imprime', () => {
    expect(accionesDeClaveApi(['TICKETS:LECTURA', 'TICKETS:VER_TODOS'], 'TICKETS')).toEqual(
      new Set(['LECTURA', 'VER_TODOS', 'IMPRESION']),
    );
  });

  it('una clave de alta solo crea: no ve ni comenta', () => {
    expect(accionesDeClaveApi(['TICKETS:ALTAS'], 'TICKETS')).toEqual(new Set(['ALTAS']));
  });

  it('una celda fuera de PERMISOS_API (y del VER_TODOS del guard) no concede nada', () => {
    expect(
      accionesDeClaveApi(
        ['TICKETS:MODIFICACION', 'TICKETS:ASIGNAR', 'EDILICIA:LECTURA'],
        'TICKETS',
      ),
    ).toEqual(new Set());
  });

  it.each(['COMPRAS', 'EQUIPOS', 'MODULO_DESCONOCIDO'])(
    'sobre un tipo de %s las celdas de la clave no conceden nada',
    (modulo) => {
      expect(
        accionesDeClaveApi(['TICKETS:LECTURA', 'TICKETS:VER_TODOS', 'TICKETS:COMENTAR'], modulo),
      ).toEqual(new Set());
    },
  );

  it('una clave sin celdas no tiene acciones', () => {
    expect(accionesDeClaveApi([], 'TICKETS')).toEqual(new Set());
  });

  it('sobre un tipo de EDILICIA las celdas TICKETS:* de la clave no conceden nada', () => {
    expect(
      accionesDeClaveApi(
        ['TICKETS:LECTURA', 'TICKETS:VER_TODOS', 'TICKETS:ALTAS', 'TICKETS:COMENTAR'],
        'EDILICIA',
      ),
    ).toEqual(new Set());
  });
});

describe('accionesDeClaveApiParaComentar', () => {
  it('una clave con solo COMENTAR ve todos los tickets del tipo para comentarlos (L18)', () => {
    expect(accionesDeClaveApiParaComentar(['TICKETS:COMENTAR'], 'TICKETS')).toEqual(
      new Set(['COMENTAR', 'LECTURA', 'VER_TODOS']),
    );
  });

  it('una clave de lectura y comentario conserva su traducción y suma la ampliación', () => {
    expect(
      accionesDeClaveApiParaComentar(
        ['TICKETS:LECTURA', 'TICKETS:VER_TODOS', 'TICKETS:COMENTAR'],
        'TICKETS',
      ),
    ).toEqual(new Set(['LECTURA', 'VER_TODOS', 'IMPRESION', 'COMENTAR']));
  });

  it('sin COMENTAR no amplía la visibilidad', () => {
    expect(accionesDeClaveApiParaComentar(['TICKETS:ALTAS'], 'TICKETS')).toEqual(
      new Set(['ALTAS']),
    );
  });

  it('sobre un tipo de EDILICIA no amplía nada', () => {
    expect(accionesDeClaveApiParaComentar(['TICKETS:COMENTAR'], 'EDILICIA')).toEqual(new Set());
  });
});

describe('alcance de la clave de API v1 — sin acciones fuera de PERMISOS_API', () => {
  it.each([
    [['TICKETS:LECTURA', 'TICKETS:VER_TODOS', 'TICKETS:ALTAS', 'TICKETS:COMENTAR']],
    [['TICKETS:COMENTAR']],
  ])('ninguna clave concede acciones fuera de PERMISOS_API: %j', (celdas: string[]) => {
    for (const acciones of [
      accionesDeClaveApi(celdas, 'TICKETS'),
      accionesDeClaveApiParaComentar(celdas, 'TICKETS'),
    ]) {
      for (const prohibida of [
        'MODIFICACION',
        'TRANSICIONAR',
        'ASIGNAR',
        'OBSERVAR',
        'BORRADO',
      ] as const) {
        expect(acciones.has(prohibida)).toBe(false);
      }
    }
  });

  it.each(['COMPRAS', 'EQUIPOS', 'EDILICIA'])(
    'una clave completa no concede nada sobre tipos de %s, como antes de T9',
    (modulo) => {
      const celdas = ['TICKETS:LECTURA', 'TICKETS:VER_TODOS', 'TICKETS:ALTAS', 'TICKETS:COMENTAR'];
      expect(accionesDeClaveApi(celdas, modulo)).toEqual(new Set());
      expect(accionesDeClaveApiParaComentar(celdas, modulo)).toEqual(new Set());
    },
  );

  it('una clave de lectura sin COMENTAR no se amplía al comentar', () => {
    expect(accionesDeClaveApiParaComentar(['TICKETS:LECTURA'], 'TICKETS')).toEqual(
      new Set(['LECTURA', 'IMPRESION']),
    );
  });
});
