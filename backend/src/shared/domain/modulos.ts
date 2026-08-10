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

/**
 * Mapa módulo funcional → código de tipo de ticket, para filtrar el listado
 * de tickets por los módulos asignados al usuario (feature 5.2 CAPA 2).
 *
 * EQUIPOS NO mapea a ningún tipo de ticket (el módulo agrupa inventario +
 * soporte, pero el flujo de tickets de soporte usa el tipo SOPORTE) — por eso
 * queda fuera del mapa: un usuario con SOLO EQUIPOS no ve ningún tipo de
 * ticket en el listado.
 */
export const MODULO_A_TIPO_CODIGO: Record<string, string> = {
  SOPORTE: 'SOPORTE',
  COMPRAS: 'COMPRAS',
  EDILICIA: 'EDILICIA',
};

/**
 * Mapa inverso `código de tipo de ticket → módulo funcional` — deriva el
 * módulo al que pertenece un tipo de ticket a partir de su `codigo`.
 *
 * Es el inverso exacto de `MODULO_A_TIPO_CODIGO`: solo los tipos de catálogo
 * fijo (SOPORTE/COMPRAS/EDILICIA) mapean a un módulo. Un tipo CUSTOM del tenant
 * (cualquier código fuera de este mapa) NO tiene módulo → `resolverModuloDeTipoCodigo`
 * devuelve `null`, y la elegibilidad por módulo lo trata como "solo ROOT/ADMIN".
 */
export const TIPO_CODIGO_A_MODULO: Record<string, string> = Object.fromEntries(
  Object.entries(MODULO_A_TIPO_CODIGO).map(([modulo, tipoCodigo]) => [tipoCodigo, modulo]),
);

/**
 * Resuelve el módulo funcional de un tipo de ticket por su `codigo`, o `null`
 * si es un tipo custom sin módulo asociado (ver `TIPO_CODIGO_A_MODULO`).
 *
 * @param tipoCodigo Código semántico del tipo de ticket (ej. "SOPORTE").
 * @returns El código del módulo (ej. "SOPORTE") o `null` si no mapea.
 */
export const resolverModuloDeTipoCodigo = (tipoCodigo: string): string | null =>
  TIPO_CODIGO_A_MODULO[tipoCodigo] ?? null;
