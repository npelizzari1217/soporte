/**
 * Acciones por tipo de una clave de API v1 (odd/permisos-por-tipo-ticket, D4, D5 f). La clave no
 * tiene filas por tipo: sus celdas se traducen con la misma tabla de L11 que el backfill y las
 * plantillas de rol (`accionesDeTipoDesdeCeldas`), sin una segunda tabla escrita a mano.
 */
import { accionesDeTipoDesdeCeldas } from '../../tickets/domain/permisos-tipo-ticket';
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

describe('accionesDeClaveApi', () => {
  it.each(subconjuntos(PERMISOS_API).map((celdas) => [comoLasDejaElGuard(celdas)]))(
    'con las celdas %j da exactamente la traducción de L11 sobre un tipo de TICKETS',
    (celdas: string[]) => {
      expect(accionesDeClaveApi(celdas, 'TICKETS')).toEqual(
        accionesDeTipoDesdeCeldas(celdas, 'TICKETS'),
      );
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

  it('una clave de lectura sin COMENTAR no se amplía al comentar', () => {
    expect(accionesDeClaveApiParaComentar(['TICKETS:LECTURA'], 'TICKETS')).toEqual(
      new Set(['LECTURA', 'IMPRESION']),
    );
  });
});
