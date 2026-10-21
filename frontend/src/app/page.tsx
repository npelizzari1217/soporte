import { redirect } from "next/navigation";
import { usuarioDeLaCookie } from "@/shared/auth/modulo-layout-gate";
import { permisosPorTipoDelServidor } from "@/shared/auth/permisos-por-tipo-servidor";
import { visibleNavItems } from "@/shared/nav/nav-config";

/**
 * Áreas a las que puede llevar el inicio, en orden de preferencia. Cada una tiene su gate
 * (`moduloLayoutGate`, o `tiposLayoutGate` en `/tickets` y `/edilicia`), que manda a `/` a quien
 * no tiene acceso: por eso el inicio solo elige entre las que el menú le muestra al usuario, con
 * el mismo predicado que esos gates. Si redirigiera a un área ajena, el gate lo
 * devolvería acá y el navegador entraría en un ciclo de redirecciones.
 */
const DESTINOS_DE_INICIO = [
  "/tickets",
  "/edilicia",
  "/equipos",
  "/compras",
  "/preventivo",
  "/insumos",
  "/dashboard",
] as const;

/** Ayuda: visible para todos y sin gate de módulo, así que siempre es un destino válido. */
const DESTINO_SIEMPRE_DISPONIBLE = "/kb";

/**
 * Home ("/") — reenvía al primer área de `DESTINOS_DE_INICIO` que el menú le muestra al usuario
 * (odd/permisos-por-tipo-ticket, S0). Hasta ahora iba siempre a `/tickets`, pero `/tickets`
 * tiene gate de módulo y no todos los usuarios lo tienen. Sin token legible (vencido, con
 * refresh vivo) va a `/tickets`: su gate deja pasar ese caso y el control queda del lado cliente.
 *
 * Tickets y Edilicia se muestran según los permisos por tipo, que no viajan en el JWT (T6): se
 * leen del backend. Si no se pueden leer, esas dos áreas no se eligen; su gate tampoco redirige
 * sin datos, así que ninguna combinación vuelve acá en ciclo.
 */
export default async function Home(): Promise<never> {
  const user = await usuarioDeLaCookie();
  if (!user) redirect("/tickets");

  const permisosPorTipo = await permisosPorTipoDelServidor();
  const visibles = new Set(visibleNavItems(user, permisosPorTipo).map((item) => item.href));
  redirect(
    DESTINOS_DE_INICIO.find((destino) => visibles.has(destino)) ??
      DESTINO_SIEMPRE_DISPONIBLE,
  );
}
