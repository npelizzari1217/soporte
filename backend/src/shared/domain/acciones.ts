/**
 * Catálogo de acciones y módulos para la matriz de permisos por usuario.
 *
 * Fuente ÚNICA de verdad para tres capas independientes que deben coincidir:
 * el CHECK compuesto de `usuario_cliente_permisos` (WU-2), el guard de
 * autorización (`AccionesGuard`, WU-6) y los DTOs/UI del ABM (WU-7.4/7.6). Un
 * par `(modulo, accion)` inválido queda rechazado por TypeScript en
 * compile-time (el decorador `@RequiereAcciones` no compila con un código
 * inventado), por el CHECK en runtime, y por el test de deriva que compara
 * ambas fuentes contra `pg_get_constraintdef` (WU-2.1, S2).
 *
 * Ref spec: sdd/matriz-permisos-por-usuario/spec R1. Ref design: ADR-P1.
 */

/** Las 6 acciones "piso": el vocabulario común a todos los módulos. */
export const ACCIONES_PISO = [
  'LECTURA',
  'ALTAS',
  'MODIFICACION',
  'BORRADO',
  'IMPRESION',
  'APROBACION',
] as const;

/** Código de una acción piso (no necesariamente soportada por todo módulo). */
export type AccionPiso = (typeof ACCIONES_PISO)[number];

/**
 * Declaración por módulo: `piso` son las acciones del vocabulario común que
 * el módulo SÍ soporta (el resto del piso queda deshabilitado en la UI sin
 * tabla de exclusiones aparte); `extras` son acciones propias del módulo,
 * fuera del piso (ej. `VER_TODOS`, `ASIGNAR`).
 *
 * `IMPRESION` queda deliberadamente fuera de `piso` en los 6 módulos: ningún
 * endpoint del inventario la consume (R1, ya aceptado). `APROBACION` solo
 * aparece en el piso de COMPRAS.
 */
export const CATALOGO_MODULOS = {
  TICKETS: {
    piso: ['LECTURA', 'ALTAS', 'MODIFICACION'],
    extras: ['VER_TODOS', 'ASIGNAR', 'TRANSICIONAR', 'OBSERVAR', 'COMENTAR'],
  },
  COMPRAS: {
    piso: ['LECTURA', 'ALTAS', 'MODIFICACION', 'BORRADO', 'APROBACION'],
    extras: [],
  },
  EDILICIA: {
    piso: ['LECTURA', 'ALTAS', 'MODIFICACION', 'BORRADO'],
    extras: [],
  },
  EQUIPOS: {
    piso: ['LECTURA', 'ALTAS', 'MODIFICACION', 'BORRADO'],
    extras: [],
  },
  KB: {
    piso: ['LECTURA', 'ALTAS', 'MODIFICACION', 'BORRADO'],
    extras: ['VER_TODOS', 'PUBLICAR'],
  },
  DASHBOARD: {
    piso: ['LECTURA'],
    extras: [],
  },
} as const satisfies Record<string, { piso: readonly AccionPiso[]; extras: readonly string[] }>;

/** Código de un módulo funcional de la matriz de permisos. */
export type Modulo = keyof typeof CATALOGO_MODULOS;

/** Acciones (piso + extras) que un módulo dado soporta. */
type AccionesDe<M extends Modulo> =
  (typeof CATALOGO_MODULOS)[M]['piso'][number] | (typeof CATALOGO_MODULOS)[M]['extras'][number];

/**
 * Código de acción válido, `MODULO:ACCION`. Derivado por template literal
 * types de `CATALOGO_MODULOS`: un par que el catálogo no declara NO compila.
 */
export type CodigoAccion = { [M in Modulo]: `${M}:${AccionesDe<M>}` }[Modulo];

/**
 * Los 28 pares `(modulo, accion)` válidos, aplanados desde `CATALOGO_MODULOS`.
 * Única fuente que consumen el test de deriva (WU-2.1), el bypass de
 * ADMINISTRADOR (`resolverScope`, WU-7.1) y la validación de DTOs (WU-7.4).
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
export const moduloDe = (codigo: CodigoAccion): Modulo => codigo.split(':')[0] as Modulo;
