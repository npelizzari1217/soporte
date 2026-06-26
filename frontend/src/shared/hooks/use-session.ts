"use client";

/**
 * useSession — consumes SessionContext and exposes user identity + permission check.
 *
 * Returns:
 *   - `user`      JwtPayload | null  — decoded JWT payload (null while loading)
 *   - `isLoading` boolean            — true when no initialUser was provided (prevents FOUC)
 *   - `can(permiso)` boolean         — true if user.permisos includes the given permiso
 *
 * Usage for gated UI:
 *   ```tsx
 *   const { isLoading, can } = useSession();
 *   if (isLoading) return <Skeleton />;
 *   if (!can('ticket:crear')) return null;
 *   ```
 *
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

  return { user, isLoading, can };
}
