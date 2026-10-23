import { describe, expect, it } from 'vitest';
import {
  ACCIONES_TIPO_TICKET,
  accionesDePlantilla,
  filasDeTiposDesdePlantilla,
  PlantillaPorTipo,
  problemaDeFilaDeTipo,
} from './permisos-tipo-ticket';

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

describe('plantillas por tipo (T9a, L50.4)', () => {
  /** Plantilla de prueba con acciones distintas por módulo, para ver que se elige por el del tipo. */
  const PLANTILLA: PlantillaPorTipo = {
    TICKETS: ['LECTURA', 'ASIGNAR'],
    COMPRAS: [],
    EDILICIA: ['LECTURA', 'COMENTAR'],
    EQUIPOS: ['LECTURA'],
  };
  const tipos = [
    { id: 'tipo-soporte', modulo: 'TICKETS' },
    { id: 'tipo-mantenimiento', modulo: 'EDILICIA' },
    { id: 'tipo-compras', modulo: 'COMPRAS' },
    { id: 'tipo-raro', modulo: 'MODULO_DESCONOCIDO' },
  ];

  it('accionesDePlantilla da las acciones del módulo del tipo', () => {
    expect(accionesDePlantilla(PLANTILLA, 'EDILICIA')).toEqual(['LECTURA', 'COMENTAR']);
    expect(accionesDePlantilla(PLANTILLA, 'EQUIPOS')).toEqual(['LECTURA']);
  });

  it('un módulo fuera de MODULOS no recibe nada: el tipo queda cerrado (S4)', () => {
    expect(accionesDePlantilla(PLANTILLA, 'MODULO_DESCONOCIDO')).toEqual([]);
    expect(accionesDePlantilla(PLANTILLA, 'toString')).toEqual([]);
  });

  it('filasDeTiposDesdePlantilla da una fila por par (tipo, acción), según el módulo de cada tipo', () => {
    expect(
      filasDeTiposDesdePlantilla(PLANTILLA, tipos)
        .map((f) => `${f.tipoId}:${f.accion}`)
        .sort(),
    ).toEqual(
      [
        'tipo-soporte:LECTURA',
        'tipo-soporte:ASIGNAR',
        'tipo-mantenimiento:LECTURA',
        'tipo-mantenimiento:COMENTAR',
      ].sort(),
    );
  });

  it('una plantilla vacía (ADMINISTRADOR) no produce filas', () => {
    const vacia: PlantillaPorTipo = { TICKETS: [], COMPRAS: [], EDILICIA: [], EQUIPOS: [] };
    expect(filasDeTiposDesdePlantilla(vacia, tipos)).toEqual([]);
  });
});

describe('problemaDeFilaDeTipo (T7, S3)', () => {
  it('una fila vacía, o con Ver y cualquier otra acción del vocabulario, es válida', () => {
    expect(problemaDeFilaDeTipo([])).toBeNull();
    expect(problemaDeFilaDeTipo(['LECTURA'])).toBeNull();
    expect(problemaDeFilaDeTipo([...ACCIONES_TIPO_TICKET])).toBeNull();
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

  it('BORRADO se concede con Ver (S8), y sin Ver no, como cualquier otra acción (S3)', () => {
    expect(problemaDeFilaDeTipo(['LECTURA', 'BORRADO'])).toBeNull();
    expect(problemaDeFilaDeTipo(['BORRADO'])).toEqual({ tipo: 'sin-ver', acciones: ['BORRADO'] });
  });

  it('una acción fuera del vocabulario se informa antes que las demás reglas', () => {
    expect(problemaDeFilaDeTipo(['APROBACION', 'BORRADO'])).toEqual({
      tipo: 'desconocida',
      acciones: ['APROBACION'],
    });
  });
});
