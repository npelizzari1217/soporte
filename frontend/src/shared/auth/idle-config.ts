/**
 * Constantes de configuración del idle-timeout — módulo puro (sin `window`, sin I/O).
 * Único lugar de configuración: cualquier ajuste de umbral se hace acá.
 *
 * Spec: PR11 — idle-timeout (15 min de inactividad, aviso 60s antes del corte).
 */

/** Tiempo total de inactividad hasta el corte de sesión (15 min). */
export const IDLE_TIMEOUT_MS = 900_000;

/** Ventana de aviso antes del corte (60 s antes de IDLE_TIMEOUT_MS). */
export const WARNING_BEFORE_MS = 60_000;

/** Throttle mínimo entre reprogramaciones por actividad del usuario. */
export const ACTIVITY_THROTTLE_MS = 1_000;

/** Eventos DOM que cuentan como actividad del usuario. */
export const IDLE_ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
] as const;
