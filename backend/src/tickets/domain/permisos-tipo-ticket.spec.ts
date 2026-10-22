import { describe, expect, it } from 'vitest';
import {
  ACCIONES_TIPO_TICKET,
  ACCIONES_TIPO_TICKET_CONCEDIBLES,
  AccionTipoTicket,
  accionesDeTipoDesdeCeldas,
  celdaReemplazadaPorTipo,
  filasDeTiposDesdeCeldas,
  problemaDeFilaDeTipo,
} from './permisos-tipo-ticket';
import { PARES_VALIDOS } from '../../shared/domain/acciones';

/** El resultado como lista ordenada, para comparar sin depender del orden de inserción. */
function ordenadas(acciones: ReadonlySet<AccionTipoTicket>): AccionTipoTicket[] {
  return [...acciones].sort();
}

describe('ACCIONES_TIPO_TICKET', () => {
  it('enumera las 10 acciones por tipo con los códigos del catálogo actual (D4)', () => {
    expect([...ACCIONES_TIPO_TICKET]).toEqual([
      'LECTURA',
      'VER_TODOS',
      'ALTAS',
      'MODIFICACION',
      'TRANSICIONAR',
      'ASIGNAR',
      'COMENTAR',
      'OBSERVAR',
      'IMPRESION',
      'BORRADO',
    ]);
  });
});

describe('accionesDeTipoDesdeCeldas — tipo de módulo TICKETS (L11)', () => {
  it.each([
    ['TICKETS:VER_TODOS', ['VER_TODOS']],
    ['TICKETS:ALTAS', ['ALTAS']],
    ['TICKETS:MODIFICACION', ['MODIFICACION']],
    ['TICKETS:TRANSICIONAR', ['TRANSICIONAR']],
    ['TICKETS:ASIGNAR', ['ASIGNAR']],
    ['TICKETS:COMENTAR', ['COMENTAR']],
    ['TICKETS:OBSERVAR', ['OBSERVAR']],
  ])('%s se traduce a %j', (celda, esperadas) => {
    expect(ordenadas(accionesDeTipoDesdeCeldas([celda], 'TICKETS'))).toEqual([...esperadas].sort());
  });

  it('TICKETS:LECTURA da Ver y también Imprimir', () => {
    expect(ordenadas(accionesDeTipoDesdeCeldas(['TICKETS:LECTURA'], 'TICKETS'))).toEqual(
      ['IMPRESION', 'LECTURA'].sort(),
    );
  });

  it('con todas las celdas de TICKETS da las 9 acciones y nunca Borrar', () => {
    const celdas = [
      'TICKETS:LECTURA',
      'TICKETS:VER_TODOS',
      'TICKETS:ALTAS',
      'TICKETS:MODIFICACION',
      'TICKETS:TRANSICIONAR',
      'TICKETS:ASIGNAR',
      'TICKETS:COMENTAR',
      'TICKETS:OBSERVAR',
    ];

    expect(ordenadas(accionesDeTipoDesdeCeldas(celdas, 'TICKETS'))).toEqual(
      ACCIONES_TIPO_TICKET.filter((a) => a !== 'BORRADO').sort(),
    );
  });

  it('las celdas de EDILICIA no alcanzan a un tipo de TICKETS', () => {
    const celdas = ['EDILICIA:LECTURA', 'EDILICIA:ALTAS', 'EDILICIA:MODIFICACION'];

    expect(accionesDeTipoDesdeCeldas(celdas, 'TICKETS').size).toBe(0);
  });
});

describe('accionesDeTipoDesdeCeldas — tipo de módulo EDILICIA (L11)', () => {
  it('EDILICIA:LECTURA da Ver, Ver todos e Imprimir', () => {
    expect(ordenadas(accionesDeTipoDesdeCeldas(['EDILICIA:LECTURA'], 'EDILICIA'))).toEqual(
      ['IMPRESION', 'LECTURA', 'VER_TODOS'].sort(),
    );
  });

  it('EDILICIA:ALTAS da Crear', () => {
    expect(ordenadas(accionesDeTipoDesdeCeldas(['EDILICIA:ALTAS'], 'EDILICIA'))).toEqual(['ALTAS']);
  });

  it('EDILICIA:MODIFICACION da Modificar, Estado y Comentar', () => {
    expect(ordenadas(accionesDeTipoDesdeCeldas(['EDILICIA:MODIFICACION'], 'EDILICIA'))).toEqual(
      ['COMENTAR', 'MODIFICACION', 'TRANSICIONAR'].sort(),
    );
  });

  it('EDILICIA:BORRADO se ignora: sigue siendo permiso del módulo (L21)', () => {
    expect(accionesDeTipoDesdeCeldas(['EDILICIA:BORRADO'], 'EDILICIA').size).toBe(0);
  });

  it('las celdas de TICKETS no alcanzan a un tipo de EDILICIA', () => {
    const celdas = ['TICKETS:LECTURA', 'TICKETS:VER_TODOS', 'TICKETS:ASIGNAR', 'TICKETS:OBSERVAR'];

    expect(accionesDeTipoDesdeCeldas(celdas, 'EDILICIA').size).toBe(0);
  });
});

describe('accionesDeTipoDesdeCeldas — tipos de módulo COMPRAS o EQUIPOS (L21)', () => {
  it.each(['COMPRAS', 'EQUIPOS'])('un tipo de %s se migra con la regla de TICKETS', (modulo) => {
    // Hace falta alguna celda del módulo del tipo: hoy (S0) sin ella el ticket no se ve.
    const celdas = ['TICKETS:LECTURA', 'TICKETS:ASIGNAR', `${modulo}:LECTURA`];

    expect(ordenadas(accionesDeTipoDesdeCeldas(celdas, modulo))).toEqual(
      ['ASIGNAR', 'IMPRESION', 'LECTURA'].sort(),
    );
  });

  it.each(['COMPRAS', 'EQUIPOS'])(
    'sin ninguna celda de %s no da acciones aunque tenga TICKETS: hoy no ve esos tickets (S7)',
    (modulo) => {
      const celdas = ['TICKETS:LECTURA', 'TICKETS:MODIFICACION', 'TICKETS:VER_TODOS'];

      expect(accionesDeTipoDesdeCeldas(celdas, modulo).size).toBe(0);
    },
  );

  it.each(['COMPRAS', 'EQUIPOS'])('las celdas propias de %s no dan acciones', (modulo) => {
    const celdas = [`${modulo}:LECTURA`, `${modulo}:ALTAS`, `${modulo}:MODIFICACION`];

    expect(accionesDeTipoDesdeCeldas(celdas, modulo).size).toBe(0);
  });
});

describe('accionesDeTipoDesdeCeldas — bordes', () => {
  it('sin celdas devuelve el conjunto vacío', () => {
    expect(accionesDeTipoDesdeCeldas([], 'TICKETS').size).toBe(0);
    expect(accionesDeTipoDesdeCeldas([], 'EDILICIA').size).toBe(0);
  });

  it('Borrar no se concede nunca, aunque exista la celda de borrado del módulo', () => {
    const celdas = ['TICKETS:BORRADO', 'EDILICIA:BORRADO', 'TICKETS:LECTURA', 'EDILICIA:LECTURA'];

    expect(accionesDeTipoDesdeCeldas(celdas, 'TICKETS').has('BORRADO')).toBe(false);
    expect(accionesDeTipoDesdeCeldas(celdas, 'EDILICIA').has('BORRADO')).toBe(false);
  });

  it('Imprimir no se concede sin Ver', () => {
    const celdas = ['TICKETS:VER_TODOS', 'TICKETS:MODIFICACION', 'TICKETS:IMPRESION'];

    expect(accionesDeTipoDesdeCeldas(celdas, 'TICKETS').has('IMPRESION')).toBe(false);
  });

  it('un tipo de un módulo desconocido nace cerrado', () => {
    expect(accionesDeTipoDesdeCeldas(['TICKETS:LECTURA'], 'OTRO').size).toBe(0);
  });

  it('las celdas repetidas no duplican acciones', () => {
    const acciones = accionesDeTipoDesdeCeldas(
      ['EDILICIA:LECTURA', 'EDILICIA:LECTURA', 'EDILICIA:MODIFICACION'],
      'EDILICIA',
    );

    expect(ordenadas(acciones)).toEqual(
      ['COMENTAR', 'IMPRESION', 'LECTURA', 'MODIFICACION', 'TRANSICIONAR', 'VER_TODOS'].sort(),
    );
  });
});

describe('filasDeTiposDesdeCeldas — plantilla de rol sobre todos los tipos (T4c)', () => {
  const tipos = [
    { id: 'tipo-soporte', modulo: 'TICKETS' },
    { id: 'tipo-mantenimiento', modulo: 'EDILICIA' },
  ];

  it('traduce las celdas por el módulo de cada tipo, una fila por par (tipo, acción)', () => {
    const filas = filasDeTiposDesdeCeldas(['TICKETS:LECTURA', 'EDILICIA:MODIFICACION'], tipos);

    expect(filas.map((f) => `${f.tipoId}:${f.accion}`).sort()).toEqual(
      [
        'tipo-soporte:LECTURA',
        'tipo-soporte:IMPRESION',
        'tipo-mantenimiento:MODIFICACION',
        'tipo-mantenimiento:TRANSICIONAR',
        'tipo-mantenimiento:COMENTAR',
      ].sort(),
    );
  });

  it('sin celdas de tickets (la plantilla de ADMINISTRADOR) no produce filas', () => {
    expect(filasDeTiposDesdeCeldas([], tipos)).toEqual([]);
    expect(filasDeTiposDesdeCeldas(['KB:LECTURA', 'COMPRAS:LECTURA'], [tipos[1]])).toEqual([]);
  });
});

describe('problemaDeFilaDeTipo (T7, S3)', () => {
  it('una fila vacía o con Ver y cualquier otra acción concedible es válida', () => {
    expect(problemaDeFilaDeTipo([])).toBeNull();
    expect(problemaDeFilaDeTipo(['LECTURA'])).toBeNull();
    expect(problemaDeFilaDeTipo([...ACCIONES_TIPO_TICKET_CONCEDIBLES])).toBeNull();
  });

  it('sin Ver no se concede ninguna otra acción, tampoco Ver todos ni Imprimir', () => {
    expect(problemaDeFilaDeTipo(['VER_TODOS'])).toEqual({
      tipo: 'sin-ver',
      acciones: ['VER_TODOS'],
    });
    expect(problemaDeFilaDeTipo(['IMPRESION', 'ALTAS'])).toEqual({
      tipo: 'sin-ver',
      acciones: ['IMPRESION', 'ALTAS'],
    });
  });

  it('BORRADO no se concede: borrar tickets todavía no existe (S8)', () => {
    expect(ACCIONES_TIPO_TICKET_CONCEDIBLES).not.toContain('BORRADO');
    expect(problemaDeFilaDeTipo(['LECTURA', 'BORRADO'])).toEqual({
      tipo: 'no-concedible',
      acciones: ['BORRADO'],
    });
  });

  it('una acción fuera del vocabulario se informa antes que las demás reglas', () => {
    expect(problemaDeFilaDeTipo(['APROBACION', 'BORRADO'])).toEqual({
      tipo: 'desconocida',
      acciones: ['APROBACION'],
    });
  });
});

describe('celdaReemplazadaPorTipo (T7, D5 d)', () => {
  it('son exactamente las celdas de TICKETS y EDILICIA:LECTURA|ALTAS|MODIFICACION del catálogo', () => {
    expect(PARES_VALIDOS.filter(celdaReemplazadaPorTipo).sort()).toEqual(
      [
        'TICKETS:LECTURA',
        'TICKETS:ALTAS',
        'TICKETS:MODIFICACION',
        'TICKETS:VER_TODOS',
        'TICKETS:ASIGNAR',
        'TICKETS:TRANSICIONAR',
        'TICKETS:OBSERVAR',
        'TICKETS:COMENTAR',
        'EDILICIA:LECTURA',
        'EDILICIA:ALTAS',
        'EDILICIA:MODIFICACION',
      ].sort(),
    );
  });

  it('EDILICIA:BORRADO (desvincular compra, L21) y los módulos sin tickets siguen siendo del módulo', () => {
    expect(celdaReemplazadaPorTipo('EDILICIA:BORRADO')).toBe(false);
    expect(celdaReemplazadaPorTipo('COMPRAS:LECTURA')).toBe(false);
    expect(celdaReemplazadaPorTipo('TICKETS:toString')).toBe(false);
  });
});
