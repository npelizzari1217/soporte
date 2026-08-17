"use client";

/**
 * useSession — consumes SessionContext and exposes user identity + permission check.
 *
 * Returns:
 *   - `user`          JwtPayload | null  — decoded JWT payload (null while loading)
 *   - `isLoading`     boolean            — true when no initialUser was provided (prevents FOUC)
 *   - `can(permiso)`  boolean            — true if is_global_admin OR user.permisos includes the given permiso
 *   - `canModulo(m)`  boolean            — true if is_global_admin OR user.modulos includes the given módulo
 *   - `isGlobalAdmin` boolean            — true if user.is_global_admin === true (root cross-tenant)
 *   - `esAdminCliente` boolean           — true if user.rol === 'ADMINISTRADOR' OR is_global_admin
 *   - `setUser`       (u: JwtPayload) => void — applies a freshly re-emitted user (tenant switch)
 *
 * Spec: PR11 — useSession. ADR-P5/ADR-P6 (sdd/matriz-permisos-por-usuario):
 * `can()` NO necesita una rama especial para ADMINISTRADOR — el backend YA
 * materializa su bypass en `payload.permisos` (`resolverScope`, ADR-P6:
 * `permisos = [...PARES_VALIDOS]` para el ADMINISTRADOR), así que
 * `user.permisos.includes(permiso)` alcanza. `esAdminCliente` es un chequeo
 * de IDENTIDAD aparte (mismo criterio que `AdminClienteGuard`/
 * `esAdminDeCliente` del backend), para gates que no son "¿tenés esta
 * celda?" sino "¿sos administrador de este cliente?" (ABM de usuarios,
 * ciclos, catálogos — R4).
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

  /**
   * Returns true if the current user tiene el módulo dado. Always false when
   * loading. ROOT (`is_global_admin`) ve TODOS los módulos — es un flag
   * ortogonal al rol (mismo criterio que `can`).
   */
  function canModulo(modulo: string): boolean {
    if (!user) return false;
    return user.is_global_admin || (user.modulos ?? []).includes(modulo);
  }

  /** True when the JWT contains is_global_admin: true (root/super-admin). */
  const isGlobalAdmin: boolean = user?.is_global_admin ?? false;

  /**
   * True when the user is ADMINISTRADOR of the active client, OR ROOT
   * (ADR-P5). Distinto de `can()`: no es "¿tenés esta celda de la matriz?",
   * es "¿sos quien administra este cliente?" — gate de configuración (ABM de
   * usuarios/ciclos/catálogos, R4), no de la matriz de permisos.
   */
  const esAdminCliente: boolean = isGlobalAdmin || user?.rol === "ADMINISTRADOR";

  return { user, isLoading, can, canModulo, isGlobalAdmin, esAdminCliente, setUser };
}
