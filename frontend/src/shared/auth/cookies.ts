import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

/**
 * Cookie names — bare names; prefixed with `__Host-` in production via cookieAttrs/clearCookieAttrs.
 * Spec: [SPEC:frontend-auth/login-exitoso] — cookie attribute contract
 */
export const COOKIE_AT = "at";
export const COOKIE_RT = "rt";

/**
 * Access token max-age: 15 minutes (matches NestJS backend JWT expiry).
 * Must stay in sync with the backend JWT_EXPIRY env var.
 */
export const ACCESS_MAX_AGE = 900; // 15 min

/**
 * Refresh token max-age: 7 days.
 * Must stay in sync with the backend REFRESH_TOKEN_EXPIRY env var.
 */
export const REFRESH_MAX_AGE = 604800; // 7 days

const isProduction = process.env.NODE_ENV === "production";

/**
 * Return the cookie name, prefixed with `__Host-` in production.
 * The `__Host-` prefix requires Secure + Path=/ + no Domain — hardened in prod.
 */
function cookieName(name: string): string {
  return isProduction ? `__Host-${name}` : name;
}

/**
 * Build `ResponseCookie` attributes for setting a new auth cookie.
 *
 * Attributes:
 * - `httpOnly: true`   — token never readable from JS, immune to XSS exfiltration
 * - `sameSite: 'lax'`  — blocks cross-site POST/fetch (CSRF mitigation), allows top-level GET nav
 * - `secure`           — HTTPS-only in production; off on localhost for dev
 * - `path: '/'`        — visible to middleware at all routes (including `/` dashboard and `/login`)
 * - `maxAge`           — set per token type (ACCESS_MAX_AGE or REFRESH_MAX_AGE)
 */
export function cookieAttrs(name: string, maxAge: number): ResponseCookie {
  return {
    name: cookieName(name),
    value: "", // value is set by the caller via cookies().set(name, value, cookieAttrs(...))
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
 */
export function clearCookieAttrs(name: string): ResponseCookie {
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
