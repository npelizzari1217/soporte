"use client";

/**
 * useSession — consumes SessionContext and exposes user identity + permission check.
 *
 * Returns:
 *   - `user`          JwtPayload | null  — decoded JWT payload (null while loading)
 *   - `isLoading`     boolean            — true when no initialUser was provided (prevents FOUC)
 *   - `can(permiso)`  boolean            — true if is_global_admin OR user.permisos includes the given permiso
 *   - `isGlobalAdmin` boolean            — true if user.is_global_admin === true (root cross-tenant)
 *   - `setUser`       (u: JwtPayload) => void — applies a freshly re-emitted user (tenant switch)
 *
 * Spec: PR11 — useSession.
 */

import { useContext } from "react";
import { SessionContext } from "@/shared/providers/session-provider";

export function useSession() {
  const { user, isLoading, setUser } = useContext(SessionContext);

  /**
   * Returns true if the current user has the given permiso. Always false when
   * loading. ROOT (`is_global_admin`) bypasses the permisos check — it's not
   * a rol, it's an orthogonal flag, and by design it can do EVERYTHING.
   */
  function can(permiso: string): boolean {
    if (!user) return false;
    return user.is_global_admin || user.permisos.includes(permiso);
  }

  /** True when the JWT contains is_global_admin: true (root/super-admin). */
  const isGlobalAdmin: boolean = user?.is_global_admin ?? false;

  return { user, isLoading, can, isGlobalAdmin, setUser };
}
