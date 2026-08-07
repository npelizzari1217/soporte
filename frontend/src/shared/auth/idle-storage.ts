/**
 * I/O de localStorage para el idle-timeout, con guards de SSR y modo privado/quota.
 *
 * Todo acceso a `localStorage` está detrás de `typeof window !== "undefined"` y
 * envuelto en try/catch: en SSR, modo privado o cuota excedida, las lecturas
 * degradan a `null` y las escrituras son no-op silencioso (nunca crashean).
 *
 * Spec: PR11 — idle-timeout (persistencia de última actividad + señal cross-tab).
 */

/** Key de la última actividad detectada (epoch ms como string). */
export const IDLE_LAST_ACTIVITY_KEY = "soporte:idle:last-activity";

/** Key de señal de corte cross-tab (valor siempre-cambiante). */
export const IDLE_LOGOUT_KEY = "soporte:idle:logout";

/**
 * Lee el timestamp de última actividad persistido.
 * @returns el timestamp (epoch ms) o `null` si no existe, es ilegible o
 *          `localStorage` no está disponible.
 */
export function readLastActivity(): number | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(IDLE_LAST_ACTIVITY_KEY);
    if (raw === null) return null;

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Persiste el timestamp de última actividad.
 * No-op silencioso si `localStorage` no está disponible (SSR, privado, cuota).
 */
export function writeLastActivity(ts: number): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(IDLE_LAST_ACTIVITY_KEY, String(ts));
  } catch {
    // Degradación elegante: sin persistencia, sin crash.
  }
}

/**
 * Señala a otras pestañas que la sesión se cortó, escribiendo un valor
 * siempre-cambiante en `IDLE_LOGOUT_KEY` para forzar el evento `storage`.
 * No-op silencioso si `localStorage` no está disponible.
 */
export function signalLogout(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(IDLE_LOGOUT_KEY, String(Date.now()));
  } catch {
    // Degradación elegante: sin sync cross-tab, sin crash.
  }
}
