"use client";

/**
 * SessionProvider — hydrates user identity from the server-decoded JWT payload.
 *
 * `DashboardLayout` (Server Component) reads the `at` cookie and decodes the
 * JWT payload without signature verification (UI-only; the backend enforces
 * real authz on every request). It passes `initialUser` down to
 * `<Providers initialUser={user}>`, which passes it here.
 *
 * - `initialUser` provided → `user = initialUser`, `isLoading = false` (no FOUC).
 * - `initialUser` absent   → `user = null`, `isLoading = true` (e.g. RootLayout,
 *   `/login`, or anywhere outside the authenticated dashboard tree).
 *
 * `setUser` lets `TenantSwitcher` (PR11) apply the freshly re-emitted user
 * from `POST /api/auth/switch` immediately, without a full page reload.
 *
 * `initialPermisosPorTipo` (odd/permisos-por-tipo-ticket, T6) son los permisos por tipo que el
 * layout leyó del backend en el servidor. Quedan atados al `initialUser` con el que llegaron:
 * `usePermisosPorTipo` solo los usa mientras la sesión sea ESE usuario, así un cambio de cliente
 * no muestra por un instante los permisos del cliente anterior.
 *
 * Spec: PR11 — SessionProvider (design §"Sesión"), [R28] Switcher en el shell.
 */

import { createContext, useCallback, useState } from "react";
import type { JwtPayload } from "@/shared/api/types";
import type { PermisosPorTipo } from "@/shared/auth/permisos-por-tipo";

/** Permisos por tipo leídos en el servidor, junto al usuario de la sesión a la que pertenecen. */
export interface PermisosPorTipoIniciales {
  user: JwtPayload;
  permisos: PermisosPorTipo;
}

export interface SessionContextValue {
  user: JwtPayload | null;
  isLoading: boolean;
  setUser: (user: JwtPayload) => void;
  permisosPorTipoIniciales?: PermisosPorTipoIniciales | null;
}

export const SessionContext = createContext<SessionContextValue>({
  user: null,
  isLoading: true,
  setUser: () => {},
});

interface SessionProviderProps {
  children: React.ReactNode;
  initialUser?: JwtPayload | null;
  initialPermisosPorTipo?: PermisosPorTipo | null;
}

export function SessionProvider({
  children,
  initialUser,
  initialPermisosPorTipo,
}: SessionProviderProps) {
  const [user, setUserState] = useState<JwtPayload | null>(initialUser ?? null);
  const [isLoading] = useState<boolean>(!initialUser);
  const [permisosPorTipoIniciales] = useState<PermisosPorTipoIniciales | null>(() =>
    initialUser && initialPermisosPorTipo
      ? { user: initialUser, permisos: initialPermisosPorTipo }
      : null,
  );

  const setUser = useCallback((next: JwtPayload) => {
    setUserState(next);
  }, []);

  return (
    <SessionContext.Provider value={{ user, isLoading, setUser, permisosPorTipoIniciales }}>
      {children}
    </SessionContext.Provider>
  );
}
