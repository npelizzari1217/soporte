import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cookieName, COOKIE_AT } from "@/shared/auth/cookies";
import { decodeJwtPayload, type JwtPayload } from "@/shared/api/types";
import { puedeEntrarRoot } from "@/shared/auth/root-access";

/**
 * Gate REAL server-side de las áreas EXCLUSIVAS de ROOT (`/admin/clientes`,
 * `/ciclos`). Espeja el patrón de
 * `moduloLayoutGate`/`/admin/layout.tsx`: el sidebar ya oculta estos ítems a
 * quien no es ROOT (nav-config.ts, sección "ROOT"), pero eso es solo UI;
 * esta capa impide el acceso por URL directa — antes, estas 3 rutas solo
 * gateaban `isGlobalAdmin` client-side dentro de cada `*AdminView`, lo que
 * dejaba pasar el render del shell (aunque el backend 403-ee los datos) a
 * un Administrador no-root que tipeara la URL.
 *
 * Decodifica el JWT de la cookie `at` (sin verificar firma — el
 * middleware/backend son la autoridad real) y `redirect("/")` si el usuario
 * está identificado y NO es ROOT.
 *
 * Respeta el refresh tolerante (R26): si el token está ausente/expirado
 * (`user = null`), NO redirige acá — deja pasar y delega en el gate
 * client-side, para no expulsar a un ROOT con access token vencido pero
 * refresh token vivo.
 */
export async function rootLayoutGate(): Promise<void> {
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

  if (user && !puedeEntrarRoot(user)) {
    redirect("/");
  }
}
