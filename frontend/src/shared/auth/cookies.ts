import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

/**
 * Cookie names — bare names; prefixed with `__Host-` in production via
 * `cookieAttrs`/`clearCookieAttrs`.
 * Spec: [R23] BFF login route — cookie attribute contract.
 */
export const COOKIE_AT = "at";
export const COOKIE_RT = "rt";
/** Dispositivo confiable (2FA): httpOnly, solo lo lee el BFF. */
export const COOKIE_TD = "td";
/** Atadura del flujo SSO al navegador (`bindingToken`): httpOnly, vive lo que dura el flujo. */
export const COOKIE_SSO_ESTADO = "sso_st";
/** Resultado del callback SSO hasta que la pantalla de login lo consume una sola vez. */
export const COOKIE_SSO_PASO = "sso_paso";

/**
 * Access token max-age: 15 minutes. Must stay in sync with the backend's
 * JWT expiry (`@nestjs/jwt` `signOptions.expiresIn`, ADR-3).
 */
export const ACCESS_MAX_AGE = 900; // 15 min

/**
 * Refresh token max-age: 7 days. Must stay in sync with the backend's
 * refresh token TTL.
 */
export const REFRESH_MAX_AGE = 604800; // 7 days

/**
 * Dispositivo confiable: 30 días. Espeja los 30 días de `expira_at` del backend (ADR-7, D2).
 */
export const TRUSTED_DEVICE_MAX_AGE = 2592000; // 30 days

/** `sso_st`: 10 minutos, igual que la vigencia del estado en el backend. */
export const SSO_ESTADO_MAX_AGE = 600;

/** `sso_paso`: 2 minutos, el tiempo de que el navegador cargue `/login?sso=1` y lo consuma. */
export const SSO_PASO_MAX_AGE = 120;

/**
 * Return the cookie name, prefixed with `__Host-` in production.
 * The `__Host-` prefix requires Secure + Path=/ + no Domain — hardened in
 * prod. Read at call time (not module-eval time) so `NODE_ENV` can be
 * controlled per-test without import-order races.
 */
export function cookieName(name: string): string {
  return process.env.NODE_ENV === "production" ? `__Host-${name}` : name;
}

/**
 * Build `ResponseCookie` attributes for setting a new auth cookie.
 *
 * Attributes:
 * - `httpOnly: true`   — token never readable from JS, immune to XSS exfiltration
 * - `sameSite: 'lax'`  — blocks cross-site POST/fetch (CSRF mitigation), allows top-level GET nav
 * - `secure`           — HTTPS-only in production; off on localhost for dev
 * - `path: '/'`        — visible to middleware at all routes
 * - `maxAge`           — set per token type (`ACCESS_MAX_AGE` or `REFRESH_MAX_AGE`)
 *
 * @param name    Base cookie name (`COOKIE_AT` or `COOKIE_RT`).
 * @param maxAge  Cookie lifetime in seconds.
 */
export function cookieAttrs(name: string, maxAge: number): ResponseCookie {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    name: cookieName(name),
    value: "", // value is set by the caller via response.cookies.set({...cookieAttrs(...), value})
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge,
  };
}

/**
 * Build `ResponseCookie` attributes for clearing an auth cookie (`maxAge: 0`).
 * Used on logout and refresh failure to invalidate the cookie immediately.
 *
 * @param name  Base cookie name (`COOKIE_AT` or `COOKIE_RT`).
 */
export function clearCookieAttrs(name: string): ResponseCookie {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    name: cookieName(name),
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: 0,
  };
}
