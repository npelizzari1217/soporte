"use client";

/**
 * Root provider composition.
 *
 * Composition (PR6 — shell slice):
 *   <QueryProvider>
 *     <SessionProvider initialUser={initialUser}>
 *       {children}
 *     </SessionProvider>
 *   </QueryProvider>
 *
 * `initialUser` is decoded server-side in the DashboardLayout (Server Component)
 * and passed here to hydrate the SessionContext without a FOUC.
 *
 * The RootLayout uses <Providers> without initialUser (isLoading=true).
 * The DashboardLayout uses <Providers initialUser={user}> (isLoading=false immediately).
 *
 * Spec: [SPEC:frontend-ui-states/authz-ui SessionProvider]
 */

import { QueryProvider } from "./query-provider";
import { SessionProvider } from "./session-provider";
import type { JwtPayload } from "@/shared/api/types";

interface ProvidersProps {
  children: React.ReactNode;
  initialUser?: JwtPayload | null;
}

export function Providers({ children, initialUser }: ProvidersProps) {
  return (
    <QueryProvider>
      <SessionProvider initialUser={initialUser}>{children}</SessionProvider>
    </QueryProvider>
  );
}
