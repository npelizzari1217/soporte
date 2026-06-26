/**
 * DashboardLayout — Server Component (async).
 *
 * Responsibilities:
 * 1. Reads the `at` httpOnly cookie server-side via next/headers cookies().
 * 2. Decodes the JWT payload (base64url → JSON) WITHOUT signature verification.
 *    Signature is verified by the backend on every API call; this decode is for
 *    UI-only hydration (user email, roles, permisos for display and permission gating).
 * 3. Passes `initialUser` to <Providers> so SessionContext is hydrated on first render
 *    with no FOUC (flash of unauthenticated content).
 * 4. Renders the persistent <AppNav> shell + page children.
 *
 * Design: [design.md §1 DashboardLayout], ADR-4 (middleware tolerante)
 * Spec: [SPEC:frontend-ui-states/authz-ui no FOUC], [SPEC:frontend-design-system/dark-mode]
 */

import { cookies } from "next/headers";
import { Providers } from "@/shared/providers/providers";
import { AppNav } from "@/components/shell/app-nav";
import type { JwtPayload } from "@/shared/api/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const at = cookieStore.get("at")?.value;

  let initialUser: JwtPayload | null = null;

  if (at) {
    try {
      // JWTs use base64url encoding (RFC 7515): replace -→+ and _→/ before atob.
      // This is UI-only decoding; backend signature verification guards all API calls.
      const raw = at.split(".")[1];
      const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
      initialUser = JSON.parse(atob(padded)) as JwtPayload;
    } catch {
      // Malformed token (e.g. corrupted cookie) — treat as unauthenticated.
      // Middleware will redirect to /login on the next navigation.
      initialUser = null;
    }
  }

  return (
    <Providers initialUser={initialUser}>
      <div className="flex min-h-screen flex-col">
        <AppNav />
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </Providers>
  );
}
