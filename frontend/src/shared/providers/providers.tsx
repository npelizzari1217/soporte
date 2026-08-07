"use client";

/**
 * Providers — composición raíz de providers de la app.
 *
 * Composición (PR11 — auth-multitenancy):
 *   <ThemeProvider>
 *     <QueryProvider>
 *       <SessionProvider initialUser={initialUser}>
 *         <IdleTimeoutProvider>
 *           {children}
 *         </IdleTimeoutProvider>
 *       </SessionProvider>
 *     </QueryProvider>
 *   </ThemeProvider>
 *
 * ThemeProvider va afuera de todo: no depende de sesión/query y debe estar
 * disponible para cualquier componente que renderice antes de que la sesión
 * resuelva (p. ej. el ThemeToggle en /login).
 *
 * `initialUser` se decodifica server-side en DashboardLayout (Server Component,
 * lee la cookie `at`) y se pasa acá para hidratar SessionContext sin FOUC.
 * RootLayout usa `<Providers>` sin `initialUser` (isLoading=true) — eso desactiva
 * correctamente IdleTimeoutProvider fuera del dashboard (p. ej. /login) sin
 * ramificar por ruta.
 */

import { IdleTimeoutProvider } from "./idle-timeout-provider";
import { QueryProvider } from "./query-provider";
import { SessionProvider } from "./session-provider";
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
          <IdleTimeoutProvider>{children}</IdleTimeoutProvider>
        </SessionProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
