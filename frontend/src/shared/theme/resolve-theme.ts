/**
 * resolveTheme — lógica pura de resolución de tema.
 *
 * Extrae la decisión de tema del script FOUC inline a una función testeable.
 * Sin dependencias de DOM, localStorage ni matchMedia — recibe los valores ya
 * leídos, para mantenerse pura e isomórfica.
 *
 * Orden de resolución:
 *   1. Preferencia explícita del usuario ('light' | 'dark') en localStorage → gana
 *   2. Preferencia del sistema (prefers-color-scheme: light) → SOLO como
 *      fallback inicial cuando no hay preferencia guardada — NUNCA es la
 *      fuente de verdad persistente (esa es siempre la clase + localStorage).
 *   3. Fallback final: 'dark'
 *
 * @param pref Valor leído de localStorage ('light', 'dark', null, o inválido)
 * @param systemPrefersLight true si matchMedia('(prefers-color-scheme: light)').matches
 */
export function resolveTheme(
  pref: string | null,
  systemPrefersLight: boolean,
): "light" | "dark" {
  if (pref === "light") return "light";
  if (pref === "dark") return "dark";
  return systemPrefersLight ? "light" : "dark";
}
