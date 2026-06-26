"use client";

/**
 * SessionProvider — hydrates user identity from the server-decoded JWT payload.
 *
 * Design: the DashboardLayout (Server Component) reads the `at` cookie and decodes
 * the JWT payload without signature verification (UI-only; backend enforces real authz).
 * It passes `initialUser` down to `<Providers initialUser={user}>` which passes it here.
 *
 * - `initialUser` provided → `user = initialUser`, `isLoading = false` (no FOUC).
 * - `initialUser` absent   → `user = null`, `isLoading = true`
 *   (foundation leaves user=null until provided; future /api/auth/me fetch would resolve it).
 *
 * Authorization UI gating: callers use `useSession().can(permiso)`.
 * Always guard with `!isLoading && can(permiso)` to prevent FOUC of protected elements.
 *
 * Spec: [SPEC:frontend-ui-states/authz-ui SessionProvider], [SPEC:frontend-ui-states/authz-ui no FOUC]
 */

import { createContext, useState } from "react";
import type { JwtPayload } from "@/shared/api/types";

export interface SessionContextValue {
  user: JwtPayload | null;
  isLoading: boolean;
}

export const SessionContext = createContext<SessionContextValue>({
  user: null,
  isLoading: true,
});

interface SessionProviderProps {
  children: React.ReactNode;
  initialUser?: JwtPayload | null;
}

export function SessionProvider({ children, initialUser }: SessionProviderProps) {
  // useState ensures stable initial values across re-renders.
  const [user] = useState<JwtPayload | null>(initialUser ?? null);
  const [isLoading] = useState<boolean>(!initialUser);

  return (
    <SessionContext.Provider value={{ user, isLoading }}>
      {children}
    </SessionContext.Provider>
  );
}
