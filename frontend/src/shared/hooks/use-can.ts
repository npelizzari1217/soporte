"use client";

/**
 * useCan — thin wrapper over `useSession().can(permiso)` for a single permiso
 * check. Exists mainly to give `<Can>` (components/shared/can.tsx) and other
 * consumers a hook-shaped API without re-deriving `can` themselves.
 *
 * Spec: ADR-4 — Gating de UI por permiso (patrón único).
 */
import { useSession } from "./use-session";

export function useCan(permiso: string): boolean {
  const { can } = useSession();
  return can(permiso);
}
