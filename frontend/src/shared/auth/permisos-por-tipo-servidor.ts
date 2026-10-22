import { cache } from "react";
import { cookies } from "next/headers";
import { cookieName, COOKIE_AT } from "@/shared/auth/cookies";
import { decodeJwtPayload } from "@/shared/api/types";
import {
  PERMISOS_SIN_RESTRICCION,
  permisosPorTipoSchema,
  type PermisosPorTipo,
} from "@/shared/auth/permisos-por-tipo";

/**
 * Lee del backend los permisos por tipo de la sesión, del lado del servidor (odd/permisos-por-tipo-ticket,
 * T6). El JWT no los trae (D1), así que el gate de ruta de `/tickets` y `/edilicia`, el inicio y la
 * hidratación del menú los piden a `GET /tickets/permisos-por-tipo` con el access token de la cookie.
 *
 * `cache` deduplica la lectura dentro de un mismo render: el layout del dashboard y el del área la
 * piden una sola vez por request.
 *
 * ROOT y ADMINISTRADOR no consultan: el backend nunca los restringe por tipo (`esAdminDeCliente`).
 *
 * @returns Los permisos, o `null` si no se pueden conocer (sin token legible, backend caído o
 *   respuesta inválida). Con `null`, el gate deja pasar y decide el cliente, como con el token
 *   vencido (R26): el backend sigue siendo la autoridad.
 */
export const permisosPorTipoDelServidor = cache(async (): Promise<PermisosPorTipo | null> => {
  const cookieStore = await cookies();
  const at = cookieStore.get(cookieName(COOKIE_AT))?.value;
  if (!at) return null;

  let esAdmin: boolean;
  try {
    const user = decodeJwtPayload(at);
    esAdmin = user.is_global_admin || user.rol === "ADMINISTRADOR";
  } catch {
    // Token ilegible: se trata como ausente, igual que `usuarioDeLaCookie`.
    return null;
  }
  if (esAdmin) return PERMISOS_SIN_RESTRICCION;

  try {
    const res = await fetch(`${process.env.BACKEND_URL}/tickets/permisos-por-tipo`, {
      headers: { authorization: `Bearer ${at}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const parsed = permisosPorTipoSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch (error) {
    // Red caída o cuerpo no JSON: se registra y decide el cliente, que vuelve a pedirlos.
    console.error("No se pudieron leer los permisos por tipo de la sesión", error);
    return null;
  }
});
