/**
 * AdminLayout — Server Component: gate REAL del área `/admin/*` por permiso
 * (5.1). El sidebar ya oculta el ítem "Admin" a quien no corresponde, pero eso
 * es solo UI; esta capa impide el acceso por URL directa (ej. tipear
 * `/admin/catalogos`) a un usuario sin permisos de administración.
 *
 * Decodifica el JWT de la cookie `at` (sin verificar firma — igual que
 * `DashboardLayout`: el middleware/backend son la autoridad real) y redirige a
 * `/` si el usuario está identificado y NO puede entrar al área admin.
 *
 * Respeta el refresh tolerante (R26): si el token está ausente/expirado
 * (`user = null`), NO redirige acá — deja pasar y delega en el `<Can>`
 * client-side, para no expulsar a un admin con access token vencido pero
 * refresh token vivo. El gate fino por sección lo sigue haciendo cada página.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cookieName, COOKIE_AT } from "@/shared/auth/cookies";
import { decodeJwtPayload, type JwtPayload } from "@/shared/api/types";
import { puedeEntrarAdmin } from "@/shared/auth/admin-access";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const at = cookieStore.get(cookieName(COOKIE_AT))?.value;

  let user: JwtPayload | null = null;
  if (at) {
    try {
      user = decodeJwtPayload(at);
    } catch {
      user = null;
    }
  }

  // Solo redirige cuando el token es legible Y el usuario NO es admin. Token
  // ausente/ilegible (user=null) → refresh tolerante: pasa al gate client-side.
  if (user && !puedeEntrarAdmin(user)) {
    redirect("/");
  }

  return <>{children}</>;
}
