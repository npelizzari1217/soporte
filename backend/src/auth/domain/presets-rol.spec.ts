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
import { PRESETS_ROL, obtenerPresetDeRol } from './presets-rol';
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
 * (`20260825120100_backfill_preventivo_permisos`), y SOLO para TECNICO (a
 * diferencia de CSAT, COLABORADOR no lleva este módulo — ver ADR-PV6).
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
  'PREVENTIVO:LECTURA',
  'PREVENTIVO:ALTAS',
  'PREVENTIVO:MODIFICACION',
  'PREVENTIVO:BORRADO',
].sort();

describe('PRESETS_ROL', () => {
  it('TECNICO coincide con las celdas del backfill histórico + CSAT:LECTURA (G7 + WU-3.4)', () => {
    expect([...PRESETS_ROL['TECNICO']].sort()).toEqual(CELDAS_TECNICO_ESPERADAS);
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

describe('obtenerPresetDeRol', () => {
  it('devuelve Result.ok con las celdas para un rol definido', () => {
    const resultado = obtenerPresetDeRol('TECNICO');
    expect(resultado.isOk()).toBe(true);
    expect(resultado.getValue()).toEqual(PRESETS_ROL['TECNICO']);
  });

  it('devuelve Result.fail con PresetRolNoDefinidoError para un rol sin preset — NUNCA un preset vacío silencioso', () => {
    const resultado = obtenerPresetDeRol('ROL_INVENTADO_SIN_PRESET');
    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError()).toBeInstanceOf(PresetRolNoDefinidoError);
  });
});
