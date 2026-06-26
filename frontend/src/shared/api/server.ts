import { normalize } from "./normalize";

/**
 * RSC callers MUST catch ApiError(401) and call redirect('/login') from next/navigation.
 *
 * Known limitation of the tolerant middleware (ADR-4): the middleware passes through when
 * `rt` is present but `at` is expired. The first RSC backend call will therefore receive 401
 * because the catch-all proxy reads the (expired) `at` cookie server-side.
 * Full RSC refresh handling is deferred to the first data-fetching feature change.
 *
 * Spec: [SPEC:frontend-api-client/server-components]
 */

/**
 * Extracts a named cookie value from a raw Cookie header string.
 * Example: parseCookieValue("at=tok123; rt=refresh456", "at") → "tok123"
 */
function parseCookieValue(cookieHeader: string, name: string): string | undefined {
  return cookieHeader
    .split(";")
    .map((c) => c.trim())
    .map((c) => c.split("="))
    .find(([k]) => k === name)?.[1];
}

/**
 * Fetch for React Server Components — goes DIRECTLY to the NestJS backend (bypasses the BFF
 * proxy) to avoid a pointless same-server round-trip.
 *
 * @param path   API path relative to `/api/`, e.g. `"tickets"` or `"tickets/42"`.
 * @param cookieHeader  The raw `Cookie` header string forwarded from the incoming RSC request.
 *                      `serverFetch` extracts the `at` cookie value and sends it as `Bearer`.
 *
 * Usage in a Server Component:
 *   import { cookies } from 'next/headers';
 *   const cookieHeader = (await cookies()).toString();
 *   const tickets = await serverFetch<Ticket[]>('tickets', cookieHeader);
 *   // Must wrap in try/catch: redirect('/login') on ApiError(401)
 */
export async function serverFetch<T>(path: string, cookieHeader: string): Promise<T> {
  const at = parseCookieValue(cookieHeader, "at");

  const res = await fetch(`${process.env.BACKEND_URL}/api/${path}`, {
    cache: "no-store",
    headers: {
      ...(at ? { Authorization: `Bearer ${at}` } : {}),
    },
  });

  return normalize<T>(res);
}
