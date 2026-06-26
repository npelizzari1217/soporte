import { ApiError, SessionExpiredError, type ApiFetchInit } from "./types";
import { normalize } from "./normalize";

/**
 * Browser-side authenticated fetch with single-flight 401 refresh.
 *
 * Architecture (design §3):
 * - All requests go same-origin to `/api/...` (BFF proxy).
 * - The BFF injects `Authorization: Bearer <at>` server-side from the httpOnly cookie.
 * - The browser NEVER sees the token value — single-flight serializes the CALL, not the token.
 * - `refreshPromise ??=` ensures exactly ONE POST /api/auth/refresh fires for N concurrent 401s.
 *
 * Spec: [SPEC:frontend-api-client/retry-401]
 * Spec: [SPEC:frontend-api-client/single-flight]
 */

/** Module-level singleton: null when idle, a Promise while refresh is in flight. */
let refreshPromise: Promise<void> | null = null;

/**
 * Initiate (or join an in-flight) token refresh.
 * Uses the `??=` null-coalescing assignment to guarantee exactly one concurrent fetch to
 * `/api/auth/refresh`. All callers awaiting this function resolve together when the refresh
 * completes. The `.finally()` resets the promise so future 401s can trigger a new refresh.
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
      // Allow a future 401 to initiate a new refresh cycle.
      refreshPromise = null;
    });
  return refreshPromise;
}

/**
 * Low-level fetch to `/api/{path}`.
 * Handles the `json` shorthand in ApiFetchInit: serializes body + sets Content-Type.
 */
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

  return fetch(`/api/${path}`, { ...rest, headers, body: reqBody });
}

/**
 * Typed, authenticated fetch for client components.
 *
 * - Returns `T` on success (200–299); 204 returns `undefined`.
 * - On 401: triggers a single-flight refresh then retries ONCE.
 * - If the refresh fails (401): throws `SessionExpiredError`.
 * - If the retry also returns 401: throws `SessionExpiredError`.
 * - If `path === 'auth/refresh'`: skips the refresh loop (prevents infinite recursion).
 * - Network TypeErrors: thrown as `ApiError(0, "Error de red")`.
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

  // Only trigger refresh for non-refresh endpoints (prevents infinite recursion)
  if (res.status === 401 && path !== "auth/refresh") {
    try {
      await refreshSession();
    } catch {
      // refresh returned non-OK or threw — session is gone
      throw new SessionExpiredError();
    }

    // Retry the original request once with the rotated cookie
    try {
      res = await rawFetch(path, init);
    } catch (err) {
      if (err instanceof TypeError) throw new ApiError(0, "Error de red");
      throw err;
    }

    if (res.status === 401) {
      throw new SessionExpiredError();
    }

    return normalize<T>(res);
  }

  return normalize<T>(res);
}
