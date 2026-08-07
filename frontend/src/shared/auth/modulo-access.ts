import type { JwtPayload } from "@/shared/api/types";

/**
 * Módulos del sistema (5.2 CAPA 3). Única fuente de verdad del listado: la
 * consumen el gating de nav (`nav-config.ts`) y los gates server-side por ruta
 * (`/compras`, `/edilicia`, `/equipos`). El JWT trae `modulos: string[]` con el
 * subconjunto habilitado; ROOT y ADMINISTRADOR reciben todos.
 */
export const MODULOS = ["SOPORTE", "COMPRAS", "EDILICIA", "EQUIPOS"] as const;
export type Modulo = (typeof MODULOS)[number];

/**
 * ¿El usuario tiene el módulo? ROOT (`is_global_admin`) ve todo — es un flag
 * ortogonal al rol (mismo criterio que `useSession().can`).
 *
 * `null` = indeterminado (token ausente/expirado en la ventana de refresh
 * tolerante, R26): devuelve `false` acá — el llamador (gate server-side) debe
 * dejar pasar y delegar en el gate client-side, para no expulsar a un usuario
 * con access token vencido pero refresh token vivo.
 */
export function tieneModulo(
  user: Pick<JwtPayload, "is_global_admin" | "modulos"> | null,
  modulo: string,
): boolean {
  if (!user) return false;
  if (user.is_global_admin) return true;
  return (user.modulos ?? []).includes(modulo);
}
