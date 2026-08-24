/**
 * Etiquetas legibles de los módulos de la matriz de permisos — FUENTE ÚNICA.
 *
 * `CATALOGO_MODULOS` (`acciones.ts`) es espejo exacto del backend y ahí los
 * módulos viajan con su código crudo (`KB`, `EDILICIA`). Ese código sirve para
 * autorizar, no para mostrar: en la grilla del ABM de usuarios "KB" no le dice
 * nada a nadie. Este mapa vive aparte para no ensuciar el espejo del backend
 * con copy de UI.
 *
 * Lo consume el menú lateral (`nav-config.ts`, que toma de acá el `label` de
 * sus ítems de módulo) y la grilla de permisos
 * (`asignar-permisos-control.tsx`): un módulo se llama IGUAL en los dos
 * lugares, sin repetir el string.
 *
 * `satisfies Record<Modulo, string>` lo hace TOTAL contra el catálogo: sumar
 * un módulo en `CATALOGO_MODULOS` y olvidarse de su etiqueta acá no compila.
 */
import type { Modulo } from "./acciones";

export const ETIQUETAS_MODULOS = {
  TICKETS: "Tickets",
  COMPRAS: "Compras",
  EDILICIA: "Edilicia",
  EQUIPOS: "Equipos",
  // El módulo se llama `KB` en el código, el CHECK de permisos y el JWT, pero
  // para el usuario es "Ayuda": hoy contiene cómo se usa el sistema. La base
  // de conocimiento tal como se pensó — casos resueltos y su recurrencia —
  // quedó para más adelante, cuando haya historial que la alimente.
  KB: "Ayuda",
  DASHBOARD: "Dashboard",
  CSAT: "Satisfacción",
} as const satisfies Record<Modulo, string>;

/** Nombre legible de un módulo, el mismo que muestra el menú lateral. */
export const etiquetaDeModulo = (modulo: Modulo): string => ETIQUETAS_MODULOS[modulo];
