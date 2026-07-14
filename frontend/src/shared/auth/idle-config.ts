/**
 * Constantes de configuración del idle-timeout.
 * Módulo puro: sin acceso a `window`, sin lógica, sin I/O.
 * Ver design.md ADR-7.
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
