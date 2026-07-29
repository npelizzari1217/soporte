/**
 * Política de dominio: set de códigos de estado que disparan notificación
 * al solicitante cuando un ticket transiciona hacia ellos.
 *
 * Evaluado por CÓDIGO de estado, sin importar el `tipoCodigo` del ticket
 * (SOPORTE, COMPRAS, EDILICIA) — `estados` es un catálogo compartido entre
 * los 3 tipos (mismos códigos/UUIDs), lo que cambia por tipo es el grafo de
 * transiciones válidas, no el catálogo. Ver spec §0 para el análisis completo
 * (incl. alcanzabilidad por tipo, quirk heredado de auto-transición).
 *
 * Ref spec: Requirement 1, §0 (decisión fijada del set, incluye CANCELADO
 * por decisión de producto 2026-07-29).
 * Tarea: 1.8 (PR1, notif-email-estado-ticket)
 */
export const ESTADOS_NOTIFICABLES = new Set<string>([
  'RESUELTO',
  'RECHAZADO',
  'SIN_SOLUCION',
  'CERRADO',
  'CANCELADO',
]);

/** Evalúa si el código de estado destino dispara notificación. Función pura, sin DB. */
export const esEstadoNotificable = (codigo: string): boolean => ESTADOS_NOTIFICABLES.has(codigo);
