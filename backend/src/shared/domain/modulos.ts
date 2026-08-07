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
