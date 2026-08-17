import type { JwtPayload } from "@/shared/api/types";

/**
 * ¿El usuario puede entrar al área `/admin`? ADMINISTRADOR-o-ROOT (ADR-P5,
 * `sdd/matriz-permisos-por-usuario`) — la configuración (usuarios, ciclos,
 * catálogos) dejó de depender de permisos `*:gestionar` de `roles_permisos`
 * (retirados con la matriz nueva) y pasó a ser un chequeo de identidad
 * directo, MISMO criterio que `AdminClienteGuard`/`esAdminDeCliente` del
 * backend. `PERMISOS_ADMIN` (regla OR sobre 4 permisos viejos) se retiró:
 * único consumidor era esta función.
 *
 * `null` = indeterminado (token ausente o expirado en la ventana de
 * refresh tolerante, R26): NO decide acá — el llamador debe dejar pasar y
 * delegar en el gate client-side, para no expulsar a un admin cuyo access
 * token venció pero tiene refresh token vivo.
 */
export function puedeEntrarAdmin(
  user: Pick<JwtPayload, "is_global_admin" | "rol"> | null,
): boolean {
  if (!user) return false;
  return user.is_global_admin || user.rol === "ADMINISTRADOR";
}
