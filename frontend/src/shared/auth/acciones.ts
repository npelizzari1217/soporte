/**
 * Espejo EXACTO de `backend/src/shared/domain/acciones.ts` (ADR-P1,
 * `sdd/matriz-permisos-por-usuario`) — mismo criterio que `modulo-access.ts`
 * con `MODULOS`, ahora extendido a la matriz módulo × acción. Un código
 * inventado NO compila (`CodigoAccion` derivado por template literal types),
 * mismo tipo que valida `@RequiereAcciones` en el backend.
 *
 * Fuente de la grilla del ABM de usuarios (`asignar-permisos-control.tsx`) y
 * de los ~24 sitios `<Can permiso="MODULO:ACCION">`/`useCan(...)` del
 * frontend, ahora sobre este vocabulario en vez de los permisos RBAC viejos.
 *
 * Ref spec: sdd/matriz-permisos-por-usuario/spec R1. Ref design: ADR-P1.
 */

/** Las 6 acciones "piso": el vocabulario común a todos los módulos. */
export const ACCIONES_PISO = [
  "LECTURA",
  "ALTAS",
  "MODIFICACION",
  "BORRADO",
  "IMPRESION",
  "APROBACION",
] as const;

/** Código de una acción piso (no necesariamente soportada por todo módulo). */
export type AccionPiso = (typeof ACCIONES_PISO)[number];

/**
 * Declaración por módulo: `piso` son las acciones del vocabulario común que
 * el módulo SÍ soporta (el resto queda deshabilitado en la grilla sin tabla
 * de exclusiones aparte); `extras` son acciones propias del módulo.
 */
export const CATALOGO_MODULOS = {
  TICKETS: {
    piso: ["LECTURA", "ALTAS", "MODIFICACION"],
    extras: ["VER_TODOS", "ASIGNAR", "TRANSICIONAR", "OBSERVAR", "COMENTAR"],
  },
  COMPRAS: {
    piso: ["LECTURA", "ALTAS", "MODIFICACION", "BORRADO", "APROBACION"],
    extras: [],
  },
  EDILICIA: {
    piso: ["LECTURA", "ALTAS", "MODIFICACION", "BORRADO"],
    extras: [],
  },
  EQUIPOS: {
    piso: ["LECTURA", "ALTAS", "MODIFICACION", "BORRADO"],
    extras: [],
  },
  KB: {
    piso: ["LECTURA", "ALTAS", "MODIFICACION", "BORRADO"],
    extras: ["VER_TODOS", "PUBLICAR"],
  },
  DASHBOARD: {
    piso: ["LECTURA"],
    extras: [],
  },
  CSAT: {
    piso: ["LECTURA"],
    extras: [],
  },
  PREVENTIVO: {
    piso: ["LECTURA", "ALTAS", "MODIFICACION", "BORRADO"],
    extras: [],
  },
  /**
   * INSUMOS gobierna la bitácora de movimientos de stock, no el catálogo: el
   * ABM de insumos, familias, unidades y modelos sigue detrás del gate de
   * administrador del cliente (Entrega 1).
   *
   * Tres pares, y lo que NO está es tan deliberado como lo que sí:
   * - `LECTURA`: consultar el stock y la bitácora de un insumo.
   * - `ALTAS`: registrar un movimiento — ENTRADA y SALIDA, la operación
   *   cotidiana.
   * - `AJUSTAR`: firmar un AJUSTE, la única operación que puede tapar un
   *   faltante. Va como extra y NO reusa `APROBACION`, que sería el par
   *   aparente: en COMPRAS hay un registro pendiente que un segundo actor
   *   aprueba después, y acá no hay nada pendiente sino una atribución para
   *   escribir. Además `APROBACION` solo existe en el piso de COMPRAS y
   *   reusarla rompería esa invariante.
   * - Sin `MODIFICACION` ni `BORRADO`: la bitácora es append-only. Un
   *   movimiento se corrige con otro movimiento, así que declararlas
   *   prometería en la grilla una operación que ningún endpoint ofrece.
   * - Sin `IMPRESION`: queda fuera del piso en TODOS los módulos, no solo en
   *   este — ningún endpoint del sistema la consume.
   *
   * Ref design: openspec/changes/insumos-entrega-2/design.md, decisión 2.
   */
  INSUMOS: {
    piso: ["LECTURA", "ALTAS"],
    extras: ["AJUSTAR"],
  },
} as const satisfies Record<string, { piso: readonly AccionPiso[]; extras: readonly string[] }>;

/** Código de un módulo funcional de la matriz de permisos. */
export type Modulo = keyof typeof CATALOGO_MODULOS;

/** Acciones (piso + extras) que un módulo dado soporta. */
type AccionesDe<M extends Modulo> =
  (typeof CATALOGO_MODULOS)[M]["piso"][number] | (typeof CATALOGO_MODULOS)[M]["extras"][number];

/**
 * Código de acción válido, `MODULO:ACCION`. Un par que el catálogo no
 * declara NO compila — mismo tipo derivado que en el backend.
 */
export type CodigoAccion = { [M in Modulo]: `${M}:${AccionesDe<M>}` }[Modulo];

/**
 * Los pares `(modulo, accion)` válidos, aplanados desde `CATALOGO_MODULOS`.
 * La cantidad no se escribe acá a propósito: caduca con cada módulo nuevo y
 * el que la verifica es `acciones.test.ts`, que enumera los pares uno por uno.
 */
export const PARES_VALIDOS: readonly CodigoAccion[] = (
  Object.entries(CATALOGO_MODULOS) as [
    Modulo,
    { piso: readonly string[]; extras: readonly string[] },
  ][]
).flatMap(([modulo, def]) =>
  [...def.piso, ...def.extras].map((accion) => `${modulo}:${accion}` as CodigoAccion),
);

/** Los pares válidos de un módulo específico. */
export const accionesDeModulo = (modulo: Modulo): readonly CodigoAccion[] =>
  PARES_VALIDOS.filter((par) => par.startsWith(`${modulo}:`));

/** Extrae el módulo de un código `MODULO:ACCION`. */
export const moduloDe = (codigo: CodigoAccion): Modulo => codigo.split(":")[0] as Modulo;
