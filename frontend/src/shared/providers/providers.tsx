"use client";

/**
 * Root provider composition.
 *
 * Composition (PR5 — admin-general, TenantContext added):
 *   <QueryProvider>
 *     <SessionProvider initialUser={initialUser}>
 *       <TenantContextProvider>
 *         {children}
 *       </TenantContextProvider>
 *     </SessionProvider>
 *   </QueryProvider>
 *
 * `initialUser` is decoded server-side in the DashboardLayout (Server Component)
 * and passed here to hydrate the SessionContext without a FOUC.
 *
 * TenantContextProvider MUST be nested inside SessionProvider (it reads useSession
 * to derive clienteId/cicloId from the JWT) and remains inside QueryProvider so the
 * admin feature hooks (useClientes/useCiclos) can use TanStack Query.
 *
 * The RootLayout uses <Providers> without initialUser (isLoading=true).
 * The DashboardLayout uses <Providers initialUser={user}> (isLoading=false immediately).
 *
 * Spec: [SPEC:frontend-ui-states/authz-ui SessionProvider]
 * Spec: [SPEC:admin-ui/TenantContext provee cliente + ciclo al dashboard completo]
 */

import { QueryProvider } from "./query-provider";
import { SessionProvider } from "./session-provider";
import { TenantContextProvider } from "./tenant-context";
import type { JwtPayload } from "@/shared/api/types";

interface ProvidersProps {
  children: React.ReactNode;
  initialUser?: JwtPayload | null;
}

export function Providers({ children, initialUser }: ProvidersProps) {
  return (
    <QueryProvider>
      <SessionProvider initialUser={initialUser}>
        <TenantContextProvider>{children}</TenantContextProvider>
      </SessionProvider>
    </QueryProvider>
  );
}
