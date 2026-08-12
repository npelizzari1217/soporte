import type { JwtPayload } from "@/shared/api/types";

/**
 * Etiqueta legible del "tipo de usuario" para mostrar en el sidebar
 * (bloque de identidad, encima del menú de navegación).
 *
 * Es puramente de PRESENTACIÓN — no reemplaza a `is_global_admin`/`rol` como
 * fuente de autorización (eso lo siguen resolviendo `useSession().can` y
 * los gates de `shared/auth/*`, mismo criterio que `puedeEntrarRoot`).
 *
 * Mapeo (orden de precedencia):
 * - ROOT (`is_global_admin: true`) → "Root". NUNCA se deriva de `rol`
 *   (ortogonalidad — mismo criterio que el resto del dominio de auth).
 * - `rol` ADMINISTRADOR/TECNICO/COLABORADOR/USUARIO → etiqueta 1:1.
 * - `rol` null y no-root (ej. token MASTER de un usuario no-root, caso que
 *   no debería ocurrir en la práctica) → "—".
 */
const ROL_LABELS: Record<string, string> = {
  ADMINISTRADOR: "Administrador",
  TECNICO: "Técnico",
  COLABORADOR: "Colaborador",
  USUARIO: "Usuario",
};

/**
 * Deriva el tipo de usuario a mostrar a partir del payload del JWT.
 *
 * @param user  Payload de sesión (o solo los campos que decide el tipo).
 */
export function tipoUsuario(user: Pick<JwtPayload, "is_global_admin" | "rol">): string {
  if (user.is_global_admin) return "Root";
  if (user.rol && ROL_LABELS[user.rol]) return ROL_LABELS[user.rol];
  return "—";
}
