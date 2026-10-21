import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cookieName, COOKIE_AT } from "@/shared/auth/cookies";
import { decodeJwtPayload, type JwtPayload } from "@/shared/api/types";
import { tieneModulo } from "@/shared/auth/modulo-access";

/**
 * Gate REAL server-side de un área por MÓDULO (5.2 CAPA 3). Espeja el patrón de
 * `/admin/layout.tsx`: el sidebar ya oculta el ítem a quien no tiene el módulo,
 * pero eso es solo UI; esta capa impide el acceso por URL directa.
 *
 * Decodifica el JWT de la cookie `at` (sin verificar firma — el
 * middleware/backend son la autoridad real) y `redirect("/")` si el usuario
 * está identificado y NO tiene el módulo.
 *
 * Respeta el refresh tolerante (R26): si el token está ausente/expirado
 * (`user = null`), NO redirige — deja pasar y delega en el gate client-side,
 * para no expulsar a un usuario con access token vencido pero refresh vivo.
 *
 * @param modulo  Código del módulo requerido (TICKETS, COMPRAS, EDILICIA, EQUIPOS, INSUMOS, PREVENTIVO…).
 */
export async function moduloLayoutGate(modulo: string): Promise<void> {
  const user = await usuarioDeLaCookie();

  // Solo redirige cuando el token es legible Y el usuario NO tiene el módulo.
  // Token ausente/ilegible (user=null) → refresh tolerante: pasa al gate client-side.
  if (user && !tieneModulo(user, modulo)) {
    redirect("/");
  }
}

/**
 * Usuario del access token de la cookie `at`, decodificado sin verificar firma (la autoridad es
 * el backend). `null` si la cookie falta o no se puede leer: quien llama decide qué hacer en ese
 * caso, normalmente dejar pasar por el refresh tolerante (R26).
 *
 * @returns El payload del JWT, o `null`.
 */
export async function usuarioDeLaCookie(): Promise<JwtPayload | null> {
  const cookieStore = await cookies();
  const at = cookieStore.get(cookieName(COOKIE_AT))?.value;
  if (!at) return null;
  try {
    return decodeJwtPayload(at);
  } catch {
    // Token ilegible: se trata como ausente, igual que una cookie vencida.
    return null;
  }
}
