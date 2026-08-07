"use client";

/**
 * <Can> — declarative render-guard for permission-gated UI (ADR-4).
 *
 * Renders `children` only when `useSession().can(permiso)` is true; otherwise
 * renders `fallback` (default: nothing). This NEVER replaces backend
 * authorization — every gated view must still handle 403/404 from the API.
 *
 * Spec: ADR-4 — Gating de UI por permiso (patrón único).
 */
import type { ReactNode } from "react";
import { useCan } from "@/shared/hooks/use-can";

export interface CanProps {
  permiso: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export function Can({ permiso, children, fallback = null }: CanProps) {
  const allowed = useCan(permiso);
  return <>{allowed ? children : fallback}</>;
}
