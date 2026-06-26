"use client";

import { QueryProvider } from "./query-provider";

/**
 * Root provider composition.
 *
 * Current composition (PR3 — api-client slice):
 *   <QueryProvider>
 *     {children}
 *   </QueryProvider>
 *
 * T17 (PR6 — shell slice) will add:
 *   <QueryProvider>
 *     <SessionProvider initialUser={initialUser}>
 *       {children}
 *     </SessionProvider>
 *   </QueryProvider>
 *
 * T18 (PR6) wires this into app/layout.tsx.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
