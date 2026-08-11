/**
 * Módulos funcionales de la plataforma — eje de autorización ortogonal al RBAC.
 *
 * Un usuario "ve" (puede operar) un módulo si lo tiene asignado en el cliente
 * activo (tabla `usuario_cliente_modulos`), salvo ROOT/ADMINISTRADOR que ven
 * TODOS. Este eje se resuelve en login/switch/refresh y viaja en el JWT
 * (`modulos: string[]`) para que el front y los guards no golpeen la DB.
 */
export const MODULOS = ['SOPORTE', 'COMPRAS', 'EDILICIA', 'EQUIPOS'] as const;

/** Código de un módulo funcional válido. */
export type Modulo = (typeof MODULOS)[number];

/** Copia mutable para poblar el JWT (ROOT/ADMINISTRADOR ven todo). */
export const TODOS_LOS_MODULOS = (): string[] => [...MODULOS];

/** Type guard: `true` si el string es un módulo funcional válido. */
export const esModuloValido = (valor: string): valor is Modulo =>
  (MODULOS as readonly string[]).includes(valor);

/**
 * Infiere el módulo funcional de un tipo de ticket a partir de su `codigo`,
 * por coincidencia de substring: si el código contiene el nombre de un módulo
 * (COMPRAS/EDILICIA/EQUIPOS) → ese módulo; si no matchea ninguno → `SOPORTE`
 * (fallback catch-all). Los canónicos (SOPORTE/COMPRAS/EDILICIA) caen en la
 * misma lógica.
 *
 * ⚠️ Debe mantenerse en SYNC con el backfill SQL de la migración
 * `20260811120000_add_modulo_to_tipos_ticket` (mismo orden de prioridad).
 *
 * Uso: NO es la fuente de verdad en runtime (esa es la columna `modulo` de
 * `tipos_ticket`); sirve como default sugerido en el ABM y documenta/verifica
 * la heurística del backfill B2.
 *
 * @param codigo Código semántico del tipo de ticket (ej. "COMPRAS_GENERALES").
 * @returns El módulo inferido.
 */
export const inferirModuloDeCodigo = (codigo: string): Modulo => {
  const upper = codigo.toUpperCase();
  // Prioridad COMPRAS > EDILICIA > EQUIPOS; SOPORTE es el fallback (por eso se
  // excluye de la búsqueda: cualquier no-match cae a él).
  const match = MODULOS.find((m) => m !== 'SOPORTE' && upper.includes(m));
  return match ?? 'SOPORTE';
};
