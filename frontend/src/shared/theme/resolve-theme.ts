/**
 * resolveTheme — lógica pura de resolución de tema.
 *
 * Extrae la decisión de tema del script FOUC inline a una función testeable.
 * Sin dependencias de DOM, localStorage ni matchMedia — recibe los valores
 * ya leídos para mantenerse pura e isomórfica.
 *
 * Orden de resolución (Constitución §3 + D2 del design):
 *   1. Preferencia explícita del usuario ('light' | 'dark') en localStorage → gana
 *   2. Preferencia del sistema (prefers-color-scheme: light) → sigue al sistema
 *   3. Fallback: 'dark' (cinematográfico por defecto per §3)
 *
 * @param pref - Valor leído de localStorage ('light', 'dark', null, o cualquier string inválido)
 * @param systemPrefersLight - true si matchMedia('(prefers-color-scheme: light)').matches
 * @returns El tema a aplicar: 'light' | 'dark'
 */
export function resolveTheme(
  pref: string | null,
  systemPrefersLight: boolean,
): "light" | "dark" {
  if (pref === "light") return "light";
  if (pref === "dark") return "dark";
  // Sin preferencia explícita (o valor inválido): seguir al sistema; default dark
  return systemPrefersLight ? "light" : "dark";
}
