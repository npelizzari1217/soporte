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
 * Typed, authenticated fetch for client components.
 *
 * - Returns `T` on success (200-299); 204 returns `undefined`.
 * - On 401: triggers a single-flight refresh, then retries the original request ONCE.
 * - If the refresh fails, or the retry still returns 401: throws `SessionExpiredError`.
 * - If `path === 'auth/refresh'`: skips the refresh loop entirely (prevents infinite recursion).
 * - Network `TypeError`s are normalized to `ApiError(0, "Error de red")`.
 *
 * Usage with TanStack Query:
 *   queryFn: () => apiFetch<Ticket[]>('tickets')
 *   mutationFn: (dto) => apiFetch<Ticket>('tickets', { method: 'POST', json: dto })
 */
export async function apiFetch<T>(path: string, init?: ApiFetchInit): Promise<T> {
  let res: Response;
  try {
    res = await rawFetch(path, init);
  } catch (err) {
    if (err instanceof TypeError) throw new ApiError(0, "Error de red");
    throw err;
  }

  if (res.status === 401 && path !== "auth/refresh") {
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

  return normalize<T>(res);
}
