/**
 * Corte de sesión del lado del navegador, compartido por los dos caminos que lo disparan:
 *
 * - `inactividad`: el idle-timeout (`IdleTimeoutProvider`) agotó su cuenta regresiva.
 * - `sesion-vencida`: `apiFetch` no pudo renovar la sesión (`SessionExpiredError`).
 *
 * En los dos casos el usuario termina en `/login?motivo=<motivo>`, donde `AvisoMotivo` le
 * explica por qué se cerró la sesión.
 *
 * El guard es de módulo y no se reinicia: el corte termina en una navegación completa, que
 * descarta este módulo junto con el árbol de React y la caché de TanStack Query. Así, N
 * pedidos que fallan a la vez, o un corte por inactividad que coincide con uno por sesión
 * vencida, producen UNA sola redirección.
 */
import { esRutaSinSesion } from "./rutas-publicas";
import { signalLogout } from "./idle-storage";

/** Motivos de corte que entiende `/login?motivo=`. Única fuente de verdad. */
export const MOTIVOS_CORTE = ["inactividad", "sesion-vencida"] as const;

/** Motivo por el que se cortó la sesión. */
export type MotivoCorte = (typeof MOTIVOS_CORTE)[number];

let cortando = false;

/**
 * URL de login que muestra el aviso del motivo.
 * @param motivo motivo del corte, o `null` si no se conoce.
 * @returns `/login?motivo=<motivo>`, o `/login` sin motivo.
 */
export function urlLoginPorCorte(motivo: MotivoCorte | null): string {
  return motivo ? `/login?motivo=${motivo}` : "/login";
}

/**
 * Lee el motivo que otra pestaña dejó en la señal de corte (`signalLogout`).
 * @param valor valor crudo de la clave en `localStorage` (`<motivo>:<epoch ms>`).
 * @returns el motivo, o `null` si la señal no trae uno reconocible.
 */
export function motivoDeSenal(valor: string | null): MotivoCorte | null {
  const candidato = valor?.split(":")[0];
  return MOTIVOS_CORTE.find((motivo) => motivo === candidato) ?? null;
}

/**
 * Corta la sesión en esta pestaña: avisa a las demás, revoca el refresh token y limpia las
 * cookies (`POST /api/auth/logout`), y navega a `/login?motivo=<motivo>`.
 *
 * El logout va también cuando la sesión ya venció: si el refresh tuvo éxito pero el reintento
 * volvió a dar 401, las cookies siguen puestas, y el middleware rebotaría `/login` de vuelta
 * al dashboard.
 *
 * No hace nada si el corte ya está en curso, o si la pestaña está en una ruta que se usa sin
 * sesión (`/login`, encuesta, formulario público, recuperación de contraseña): ahí un 401 no
 * significa que una sesión se haya vencido.
 *
 * @param motivo motivo que verá el usuario en el login.
 * @returns una promesa que se resuelve después de pedir la navegación.
 */
export async function cortarSesion(motivo: MotivoCorte): Promise<void> {
  if (cortando || esRutaSinSesion(window.location.pathname)) return;
  cortando = true;

  signalLogout(motivo);
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {
    // Backend inalcanzable: se navega igual. El BFF limpia las cookies siempre que responde, y
    // si no responde no hay peor caso que ya estar en /login.
  });
  window.location.assign(urlLoginPorCorte(motivo));
}

/**
 * Sigue el corte que originó OTRA pestaña: solo navega, sin volver a llamar a
 * `/api/auth/logout` (las cookies son compartidas y esa pestaña ya las limpió).
 * @param motivo motivo leído de la señal, o `null` si no trae uno.
 */
export function seguirCorteDeOtraPestana(motivo: MotivoCorte | null): void {
  if (cortando) return;
  cortando = true;
  window.location.assign(urlLoginPorCorte(motivo));
}
