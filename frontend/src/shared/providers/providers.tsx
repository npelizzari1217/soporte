"use client";

/**
 * Root provider composition.
 *
 * Composition (idle-session-timeout change — IdleTimeoutProvider added inside
 * SessionProvider, wrapping TenantContextProvider):
 *   <ThemeProvider>
 *     <QueryProvider>
 *       <SessionProvider initialUser={initialUser}>
 *         <IdleTimeoutProvider>
 *           <TenantContextProvider>
 *             {children}
 *           </TenantContextProvider>
 *         </IdleTimeoutProvider>
 *       </SessionProvider>
 *     </QueryProvider>
 *   </ThemeProvider>
 *
 * ThemeProvider sits outermost and has no dependency on session/tenant/query
 * state — it only reads localStorage/matchMedia and mutates the DOM. Placing
 * it first keeps `useTheme()` available to any component in the tree,
 * including ones that render before the session resolves (e.g. the sidebar
 * footer's ThemeToggle).
 *
 * `initialUser` is decoded server-side in the DashboardLayout (Server Component)
 * and passed here to hydrate the SessionContext without a FOUC.
 *
 * IdleTimeoutProvider MUST be nested inside SessionProvider (it reads useSession
 * to derive `enabled = user != null && !isLoading`, design ADR-4). The dashboard
 * tree has a double-nested SessionProvider (RootLayout external, user=null →
 * this instance no-ops; DashboardLayout internal, real user → this instance is
 * the only one active), so a single guard correctly disables the provider on
 * `/login` and during loading without route-based branching.
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
 * Spec: [SPEC:frontend-auth/No-op del timer sin sesión autenticada]
 * Design: idle-session-timeout ADR-4
 */

import { IdleTimeoutProvider } from "./idle-timeout-provider";
import { QueryProvider } from "./query-provider";
import { SessionProvider } from "./session-provider";
import { TenantContextProvider } from "./tenant-context";
import { ThemeProvider } from "./theme-provider";
import type { JwtPayload } from "@/shared/api/types";

interface ProvidersProps {
  children: React.ReactNode;
  initialUser?: JwtPayload | null;
}

export function Providers({ children, initialUser }: ProvidersProps) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <SessionProvider initialUser={initialUser}>
          <IdleTimeoutProvider>
            <TenantContextProvider>{children}</TenantContextProvider>
          </IdleTimeoutProvider>
        </SessionProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
