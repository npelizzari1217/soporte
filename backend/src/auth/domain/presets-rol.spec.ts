/**
 * presets-rol.spec.ts — WU-5 (sdd/matriz-permisos-por-usuario).
 *
 * `PRESETS_ROL['TECNICO']` DEBE ser exactamente el set de celdas que el
 * backfill produce para el TECNICO real de producción (#2217, mismo fixture
 * que `backfill-matriz-permisos.integration.spec.ts`) — riesgo G7: el preset
 * (TypeScript) y el backfill (SQL) expresan el mismo mapeo dos veces, en dos
 * lenguajes; si divergen, uno de los dos rompe acá.
 *
 * Ref spec: sdd/matriz-permisos-por-usuario/spec R6, S15.
 * Ref design: ADR-P9.
 */
import { MODULOS } from '../../shared/domain/modulos';
import {
  AccionTipoTicket,
  accionesDePlantilla,
  accionesDeTipoDesdeCeldas,
  celdaReemplazadaPorTipo,
} from '../../tickets/domain/permisos-tipo-ticket';
import { PRESETS_ROL_ANTERIORES_A_T9A } from '../test-helpers/presets-rol-anteriores-a-t9a';
import { PLANTILLAS_POR_TIPO_ROL, PRESETS_ROL, obtenerPresetDeRol } from './presets-rol';
import { PresetRolNoDefinidoError } from './errors/auth.errors';

/**
 * Base copiada LITERAL de `CELDAS_TECNICO_ESPERADAS` en
 * `backfill-matriz-permisos.integration.spec.ts` — mismo set, misma fuente
 * (#2217 + desvío documentado COMPRAS:LECTURA). Si un cambio futuro toca uno
 * de los dos archivos sin tocar el otro, este test y el de integración
 * divergen y uno de los dos queda en rojo (paridad G7, por diseño).
 *
 * `CSAT:LECTURA` (sdd/csat WU-3.4) es la ÚNICA excepción deliberada a esa
 * paridad: el módulo CSAT no existía cuando corrió el backfill histórico de
 * #2217, así que esa migración de una sola vez no puede conocerlo — no hay
 * SQL que "actualizar" para igualarla. G7 sigue vigente para el resto del
 * set: cualquier otra divergencia futura entre preset y backfill es un bug.
 *
 * ACTUALIZACIÓN (sdd/csat WU-10.1): el hueco de datos que dejaba esta
 * excepción — ningún usuario preexistente tenía la celda — quedó cerrado por
 * una migración de backfill APARTE (`20260824120000_backfill_csat_lectura_permiso`,
 * ver `backfill-csat-lectura.integration.spec.ts`), no por editar el backfill
 * histórico de #2217. La excepción documentada acá sigue siendo verdad al pie
 * de la letra (ese backfill puntual nunca va a conocer CSAT), pero ya no deja
 * a nadie sin el permiso: el nuevo backfill cubre exactamente los mismos
 * TECNICO/COLABORADOR activos, solo que con una migración propia y con su
 * propia paridad verificada contra este preset (mismos roles, misma celda).
 *
 * ACTUALIZACIÓN (sdd/preventivo WU-1): mismo criterio para `PREVENTIVO:*`
 * (los 4 pares piso) — módulo nuevo, backfill propio
 * (`20260825120100_backfill_preventivo_permisos`), en ese momento SOLO para
 * TECNICO.
 *
 * ACTUALIZACIÓN (preventivo-edicion-y-permisos WU-1, design ADR-3): el
 * swap de permisos movió las cuatro celdas `PREVENTIVO:*` de TECNICO a
 * COLABORADOR — ver `20260831120000_swap_preventivo_permisos_colaborador`.
 * Hoy TECNICO no lleva ninguna celda `PREVENTIVO:*` y COLABORADOR sí.
 *
 * ACTUALIZACIÓN (odd/tasks/permisos-por-tipo-ticket.md, T9a, L50.4): las celdas que reemplazan los
 * permisos por tipo (`TICKETS:*` y `EDILICIA:LECTURA|ALTAS|MODIFICACION`) salieron del preset; el
 * acceso a tickets lo da la plantilla por tipo explícita. Este set sigue siendo el del backfill
 * histórico, y el preset es este set sin esas celdas.
 */
const CELDAS_TECNICO_ESPERADAS = [
  'TICKETS:ALTAS',
  'TICKETS:COMENTAR',
  'TICKETS:MODIFICACION',
  'TICKETS:TRANSICIONAR',
  'TICKETS:ASIGNAR',
  'TICKETS:OBSERVAR',
  'TICKETS:VER_TODOS',
  'TICKETS:LECTURA',
  'EDILICIA:ALTAS',
  'EDILICIA:MODIFICACION',
  'EDILICIA:BORRADO',
  'EDILICIA:LECTURA',
  'EQUIPOS:ALTAS',
  'EQUIPOS:MODIFICACION',
  'EQUIPOS:BORRADO',
  'EQUIPOS:LECTURA',
  'KB:ALTAS',
  'KB:MODIFICACION',
  'KB:BORRADO',
  'KB:PUBLICAR',
  'KB:VER_TODOS',
  'KB:LECTURA',
  'DASHBOARD:LECTURA',
  'COMPRAS:LECTURA',
  'CSAT:LECTURA',
].sort();

describe('PRESETS_ROL', () => {
  it('TECNICO coincide con las celdas del backfill histórico + CSAT:LECTURA, sin las celdas reemplazadas por tipo (G7 + WU-3.4 + T9a)', () => {
    expect([...PRESETS_ROL['TECNICO']].sort()).toEqual(
      CELDAS_TECNICO_ESPERADAS.filter((celda) => !celdaReemplazadaPorTipo(celda)),
    );
  });

  it('TECNICO conserva EDILICIA:BORRADO: desvincular compra sigue siendo permiso del módulo (L50.2)', () => {
    expect(PRESETS_ROL['TECNICO']).toContain('EDILICIA:BORRADO');
  });

  it.each(Object.keys(PRESETS_ROL_ANTERIORES_A_T9A))(
    '%s pierde solo las celdas que reemplazan los permisos por tipo (T9a)',
    (rol) => {
      expect([...PRESETS_ROL[rol]].sort()).toEqual(
        PRESETS_ROL_ANTERIORES_A_T9A[rol].filter((celda) => !celdaReemplazadaPorTipo(celda)).sort(),
      );
    },
  );

  it('ningún preset conserva una celda reemplazada por los permisos por tipo (L50.4)', () => {
    for (const celdas of Object.values(PRESETS_ROL)) {
      expect(celdas.filter(celdaReemplazadaPorTipo)).toEqual([]);
    }
  });

  it('[hermano invertido, preventivo-edicion-y-permisos WU-1] COLABORADOR incluye las cuatro celdas PREVENTIVO:*', () => {
    expect([...PRESETS_ROL['COLABORADOR']].sort()).toEqual(
      expect.arrayContaining([
        'PREVENTIVO:ALTAS',
        'PREVENTIVO:BORRADO',
        'PREVENTIVO:LECTURA',
        'PREVENTIVO:MODIFICACION',
      ]),
    );
  });

  it('ADMINISTRADOR tiene preset vacío — bypassea, no necesita celdas (R2)', () => {
    expect(PRESETS_ROL['ADMINISTRADOR']).toEqual([]);
  });

  it('ningún preset contiene un código fuera del catálogo de 29 pares', () => {
    for (const celdas of Object.values(PRESETS_ROL)) {
      for (const codigo of celdas) {
        expect(codigo).toMatch(/^[A-Z]+:[A-Z_]+$/);
      }
    }
  });
});

/** Las acciones como lista ordenada, para comparar sin depender del orden. */
function ordenadas(acciones: Iterable<AccionTipoTicket>): AccionTipoTicket[] {
  return [...acciones].sort();
}

describe('PLANTILLAS_POR_TIPO_ROL (T9a, S7, L50.4)', () => {
  const ROLES = Object.keys(PRESETS_ROL_ANTERIORES_A_T9A);
  // Un módulo que no está en `MODULOS` no tiene plantilla: el tipo queda cerrado (S4).
  const MODULOS_DEL_TIPO = [...MODULOS, 'MODULO_DESCONOCIDO'];

  it('hay plantilla por tipo para exactamente los mismos roles que tienen preset de celdas', () => {
    expect(Object.keys(PLANTILLAS_POR_TIPO_ROL).sort()).toEqual(Object.keys(PRESETS_ROL).sort());
  });

  // Fija que el cambio no mueve el acceso de nadie (S7): la plantilla explícita da sobre cada
  // tipo lo mismo que la traducción de L11 de las celdas que tenía el rol antes de T9a.
  it.each(ROLES.flatMap((rol) => MODULOS_DEL_TIPO.map((modulo) => [rol, modulo])))(
    '%s sobre un tipo de %s da lo mismo que la traducción de L11 de su plantilla anterior',
    (rol, modulo) => {
      expect(ordenadas(accionesDePlantilla(PLANTILLAS_POR_TIPO_ROL[rol], modulo))).toEqual(
        ordenadas(accionesDeTipoDesdeCeldas(PRESETS_ROL_ANTERIORES_A_T9A[rol], modulo)),
      );
    },
  );

  it.each([
    ['USUARIO', ['LECTURA', 'ALTAS', 'COMENTAR', 'IMPRESION']],
    ['COLABORADOR', ['LECTURA', 'VER_TODOS', 'ALTAS', 'COMENTAR', 'IMPRESION']],
    [
      'TECNICO',
      [
        'LECTURA',
        'VER_TODOS',
        'ALTAS',
        'MODIFICACION',
        'TRANSICIONAR',
        'ASIGNAR',
        'COMENTAR',
        'OBSERVAR',
        'IMPRESION',
      ],
    ],
    ['ADMINISTRADOR', []],
  ] as const)('%s da en cada módulo con tickets exactamente %j', (rol, esperadas) => {
    for (const modulo of MODULOS) {
      expect(ordenadas(accionesDePlantilla(PLANTILLAS_POR_TIPO_ROL[rol], modulo))).toEqual(
        [...esperadas].sort(),
      );
    }
  });

  it('ninguna plantilla da Borrar: se concede solo desde la grilla (S8)', () => {
    for (const plantilla of Object.values(PLANTILLAS_POR_TIPO_ROL)) {
      for (const modulo of MODULOS) {
        expect(accionesDePlantilla(plantilla, modulo)).not.toContain('BORRADO');
      }
    }
  });
});

describe('obtenerPresetDeRol', () => {
  it('devuelve Result.ok con las celdas y la plantilla por tipo para un rol definido', () => {
    const resultado = obtenerPresetDeRol('TECNICO');
    expect(resultado.isOk()).toBe(true);
    expect(resultado.getValue()).toEqual({
      celdas: PRESETS_ROL['TECNICO'],
      porTipo: PLANTILLAS_POR_TIPO_ROL['TECNICO'],
    });
  });

  it('devuelve Result.fail con PresetRolNoDefinidoError para un rol sin preset — NUNCA un preset vacío silencioso', () => {
    const resultado = obtenerPresetDeRol('ROL_INVENTADO_SIN_PRESET');
    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError()).toBeInstanceOf(PresetRolNoDefinidoError);
  });
});
