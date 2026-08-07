import type { JwtPayload } from "@/shared/api/types";

/**
 * Permisos que habilitan entrar a CUALQUIER sección del área `/admin` (regla
 * OR). Única fuente de verdad: la consume el ítem "Admin" del sidebar
 * (`nav-config.ts`, gating de UI) Y el gate server-side (`/admin/layout.tsx`,
 * protección real por URL directa). El gate FINO por sección lo hace cada
 * página con `<Can>` / `useSession` (ej. Clientes exige `is_global_admin`).
 */
export const PERMISOS_ADMIN = [
  "catalogo:gestionar",
  "cliente:gestionar",
  "ciclo:gestionar",
  "usuario:gestionar",
] as const;

/**
 * ¿El usuario puede entrar al área `/admin`? ROOT (`is_global_admin`) siempre
 * puede — es un flag ortogonal al rol (mismo criterio que `useSession().can`).
 *
 * `null` = indeterminado (token ausente o expirado en la ventana de
 * refresh tolerante, R26): NO decide acá — el llamador debe dejar pasar y
 * delegar en el gate client-side, para no expulsar a un admin cuyo access
 * token venció pero tiene refresh token vivo.
 */
export function puedeEntrarAdmin(
  user: Pick<JwtPayload, "is_global_admin" | "permisos"> | null,
): boolean {
  if (!user) return false;
  if (user.is_global_admin) return true;
  return PERMISOS_ADMIN.some((p) => user.permisos.includes(p));
}
