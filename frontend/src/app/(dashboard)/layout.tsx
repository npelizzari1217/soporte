/**
 * DashboardLayout — Server Component (async).
 *
 * Responsibilities:
 * 1. Reads the `at` httpOnly cookie server-side via `next/headers` `cookies()`.
 * 2. Decodes the JWT payload (base64url → JSON) WITHOUT signature verification —
 *    the backend/middleware already guard real authorization; this decode is
 *    UI-only hydration (`cliente_nombre`, `membresias`, `permisos` for display).
 * 3. Passes `initialUser` to `<Providers>` so SessionContext hydrates on first
 *    render with no FOUC.
 * 4. Renders `<AppShell>` — role-based sidebar (nav-config.ts) + the existing
 *    `<DashboardHeader>` (tenant switcher + theme toggle + logout) +
 *    breadcrumbs, wrapping `{children}` (Fase 5 Beta, R-M0).
 *
 * Route protection itself is the middleware's job (R26) — a malformed/missing
 * cookie here just falls through to `initialUser = null`; the middleware
 * already redirected unauthenticated requests to /login before this ever runs.
 *
 * Spec: PR11 — DashboardLayout wiring (SessionProvider hydration).
 * Spec: R-M0 — Shell/layout premium (sdd/beta-frontend).
 */
import { cookies } from "next/headers";
import { Providers } from "@/shared/providers/providers";
import { AppShell } from "@/components/shell/app-shell";
import { cookieName, COOKIE_AT } from "@/shared/auth/cookies";
import { decodeJwtPayload, type JwtPayload } from "@/shared/api/types";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const at = cookieStore.get(cookieName(COOKIE_AT))?.value;

  let initialUser: JwtPayload | null = null;

  if (at) {
    try {
      initialUser = decodeJwtPayload(at);
    } catch {
      // Malformed token (e.g. corrupted cookie) — treat as unauthenticated.
      // The middleware will redirect to /login on the next navigation.
      initialUser = null;
    }
  }

  return (
    <Providers initialUser={initialUser}>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
