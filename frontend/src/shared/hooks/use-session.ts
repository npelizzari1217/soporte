"use client";

/**
 * useSession — consumes SessionContext and exposes user identity + permission check.
 *
 * Returns:
 *   - `user`          JwtPayload | null  — decoded JWT payload (null while loading)
 *   - `isLoading`     boolean            — true when no initialUser was provided (prevents FOUC)
 *   - `can(permiso)`  boolean            — true if user.permisos includes the given permiso
 *   - `isGlobalAdmin` boolean            — true if user.is_global_admin === true (operador cross-tenant)
 *
 * Usage for gated admin UI:
 *   ```tsx
 *   const { isLoading, can, isGlobalAdmin } = useSession();
 *   if (isLoading) return <Skeleton />;
 *   if (!isGlobalAdmin) return null; // solo operador ve la sección Clientes
 *   ```
 *
 * isGlobalAdmin: derived from JWT claim, zero extra fetch.
 * Spec: [SPEC:auth-rbac/Claim is_global_admin disponible en JwtPayload frontend (admin-general)]
 * Spec: [SPEC:frontend-ui-states/authz-ui SessionProvider]
 */

import { useContext } from "react";
import { SessionContext } from "@/shared/providers/session-provider";

export function useSession() {
  const { user, isLoading } = useContext(SessionContext);

  /**
   * Returns true if the current user has the given permiso.
   * Always false when user is null (loading or unauthenticated).
   */
  function can(permiso: string): boolean {
    return user?.permisos.includes(permiso) ?? false;
  }

  /**
   * True when the JWT contains is_global_admin: true.
   * Used to gate cross-tenant admin UI (sidebar Clientes section, operador selectors).
   * Invariante: is_global_admin !== rol ADMINISTRADOR — un admin-cliente puede tener false.
   * Always false when user is null (loading) or claim is absent (token legado).
   */
  const isGlobalAdmin: boolean = user?.is_global_admin ?? false;

  return { user, isLoading, can, isGlobalAdmin };
}
