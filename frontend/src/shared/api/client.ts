import { ApiError, SessionExpiredError, type ApiFetchInit } from "./types";
import { normalize } from "./normalize";

/**
 * Browser-side authenticated fetch with single-flight 401 refresh.
 *
 * - All requests go same-origin to `/api/{path}` (BFF proxy).
 * - The BFF injects `Authorization: Bearer <at>` server-side from the httpOnly cookie —
 *   the browser NEVER sees the token value.
 * - `refreshPromise ??=` ensures exactly ONE POST /api/auth/refresh fires for N
 *   concurrent 401s; every caller awaiting this function resolves together when
 *   the in-flight refresh completes.
 *
 * Spec: PR11 — apiFetch single-flight refresh (design §"apiFetch").
 */

/** Module-level singleton: null when idle, a Promise while a refresh is in flight. */
let refreshPromise: Promise<void> | null = null;

/**
 * Initiate (or join an in-flight) token refresh.
 * The `.finally()` resets the promise so a future 401 can trigger a new cycle.
 */
function refreshSession(): Promise<void> {
  refreshPromise ??= fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "same-origin",
  })
    .then((res) => {
      if (!res.ok) throw new SessionExpiredError();
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

/** Low-level fetch to `/api/{path}`. Handles the `json` shorthand in ApiFetchInit. */
async function rawFetch(path: string, init?: ApiFetchInit): Promise<Response> {
  const { json, body, ...rest } = init ?? {};
  const headers = new Headers(rest.headers as HeadersInit | undefined);
  let reqBody: BodyInit | undefined = body;

  if (json !== undefined) {
    reqBody = JSON.stringify(json);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
  }

  return fetch(`/api/${path}`, { ...rest, headers, body: reqBody, credentials: "same-origin" });
}

/**
 * Authenticated fetch + single-flight 401 refresh, devolviendo la `Response`
 * CRUDA. Es el tronco común de `apiFetch` (JSON) y `apiFetchBlob` (archivos):
 * la política de sesión es una sola, y lo único que cambia entre los dos es
 * cómo se lee el cuerpo.
 *
 * - On 401: triggers a single-flight refresh, then retries the original request ONCE.
 * - If the refresh fails, or the retry still returns 401: throws `SessionExpiredError`.
 * - If `path === 'auth/refresh'`: skips the refresh loop entirely (prevents infinite recursion).
 * - Network `TypeError`s are normalized to `ApiError(0, "Error de red")`.
 */
/**
 * Rutas donde un 401 NUNCA dispara refresh: `auth/refresh` (recursión) y el flujo de login, donde
 * el 401 significa credencial/código/ticket inválido y reintentar re-postearía la contraseña
 * (el limitador contaría doble). Se suma `auth/2fa/enrolamiento/*` por prefijo (`sinRefresh`).
 * `auth/sso/paso` consume una cookie de un solo uso: un 404/401 no se reintenta.
 */
const RUTAS_SIN_REFRESH: ReadonlySet<string> = new Set([
  "auth/refresh",
  "auth/login",
  "auth/2fa/verificar",
  "auth/login/continuar",
  "auth/login/seleccionar",
  "auth/sso/paso",
]);

function sinRefresh(path: string): boolean {
  return RUTAS_SIN_REFRESH.has(path) || path.startsWith("auth/2fa/enrolamiento/");
}

async function fetchConRefresh(path: string, init?: ApiFetchInit): Promise<Response> {
  let res: Response;
  try {
    res = await rawFetch(path, init);
  } catch (err) {
    if (err instanceof TypeError) throw new ApiError(0, "Error de red");
    throw err;
  }

  if (res.status === 401 && !sinRefresh(path)) {
    try {
      await refreshSession();
    } catch {
      throw new SessionExpiredError();
    }

    try {
      res = await rawFetch(path, init);
    } catch (err) {
      if (err instanceof TypeError) throw new ApiError(0, "Error de red");
      throw err;
    }

    if (res.status === 401) {
      throw new SessionExpiredError();
    }
  }

  return res;
}

/**
 * Typed, authenticated fetch for client components.
 *
 * - Returns `T` on success (200-299); 204 returns `undefined`.
 * - Errores HTTP y de red se normalizan a `ApiError`/`SessionExpiredError`.
 *
 * Usage with TanStack Query:
 *   queryFn: () => apiFetch<Ticket[]>('tickets')
 *   mutationFn: (dto) => apiFetch<Ticket>('tickets', { method: 'POST', json: dto })
 */
export async function apiFetch<T>(path: string, init?: ApiFetchInit): Promise<T> {
  return normalize<T>(await fetchConRefresh(path, init));
}

/** Archivo binario/textual devuelto por una ruta de descarga autenticada. */
export interface ArchivoDescargado {
  blob: Blob;
  /** Header crudo `Content-Disposition`, o `null` si el servidor no lo mandó. Parsearlo es tarea de `shared/lib/descarga.ts`. */
  contentDisposition: string | null;
}

/**
 * Variante de `apiFetch` para rutas que devuelven un ARCHIVO en vez de JSON
 * (`GET /compras/export`).
 *
 * Existe porque `normalize()` decide qué hacer por `content-type` y colapsa
 * todo lo que no sea JSON a `string`: eso pierde el `Content-Disposition` —
 * único portador del nombre del archivo— y obligaría a reconstruir el Blob.
 * El refresh single-flight ante 401 se comparte con `apiFetch` vía
 * `fetchConRefresh`, así que una sesión que expira en medio de una descarga se
 * recupera igual que en cualquier otro pedido.
 *
 * Los errores siguen siendo JSON (`{statusCode, message}` de NestJS), así que
 * se delegan a `normalize`, que tira el `ApiError` con el mensaje de dominio
 * real (p. ej. el 422 de "demasiadas filas") — el caller no distingue este
 * error de los del resto de la app.
 */
export async function apiFetchBlob(path: string, init?: ApiFetchInit): Promise<ArchivoDescargado> {
  const res = await fetchConRefresh(path, init);
  // `normalize` SIEMPRE tira cuando la respuesta no es ok: `Promise<never>`.
  if (!res.ok) return normalize<never>(res);

  return { blob: await res.blob(), contentDisposition: res.headers.get("content-disposition") };
}
