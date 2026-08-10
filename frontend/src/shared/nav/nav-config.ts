import type { LucideIcon } from "lucide-react";
import {
  Ticket,
  LayoutDashboard,
  BookOpen,
  Settings,
  Building2,
  ShoppingCart,
  Wrench,
  Monitor,
  CalendarRange,
  Tag,
} from "lucide-react";
import type { JwtPayload } from "@/shared/api/types";
import { PERMISOS_ADMIN } from "@/shared/auth/admin-access";

/**
 * nav-config — single source of truth for the sidebar navigation (ADR-4).
 *
 * Each item declares WHO can see it via `visible(can, isGlobalAdmin)`, driven
 * by the RBAC matrix (spec §1). The sidebar (and any other consumer) filters
 * `NAV_ITEMS` through this predicate — no duplicated gating logic elsewhere.
 * Gating here is UI-only; the backend remains the real authority (ADR-4).
 */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  visible: (
    can: (permiso: string) => boolean,
    isGlobalAdmin: boolean,
    canModulo: (modulo: string) => boolean,
  ) => boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/tickets",
    label: "Tickets",
    icon: Ticket,
    visible: () => true,
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    visible: (can) => can("ticket:ver_todos"),
  },
  {
    href: "/kb",
    label: "Base de conocimiento",
    icon: BookOpen,
    visible: () => true,
  },
  {
    href: "/admin/catalogos",
    label: "Admin",
    icon: Settings,
    // Misma lista que el gate server-side de `/admin` (admin-access.ts) — una
    // sola fuente de verdad para "quién ve/entra al área admin".
    visible: (can) => PERMISOS_ADMIN.some((p) => can(p)),
  },
  {
    href: "/admin/clientes",
    label: "Clientes",
    icon: Building2,
    visible: (_can, isGlobalAdmin) => isGlobalAdmin,
  },
  {
    href: "/ciclos",
    label: "Ciclos",
    icon: CalendarRange,
    // Catálogo MASTER de ciclos (ABM del ROOT, sdd/ciclos-abm-root). Distinto
    // de `/admin/ciclos` (adopción/activación por el admin del cliente,
    // gateado por `ciclo:gestionar` dentro de `/admin/catalogos`) — este ítem
    // es EXCLUSIVO de ROOT, igual que "Clientes".
    visible: (_can, isGlobalAdmin) => isGlobalAdmin,
  },
  {
    href: "/admin/tipos-componente",
    label: "Tipos de componente",
    icon: Tag,
    // Catálogo MASTER de tipos de componente (ABM del ROOT, PR5,
    // sdd/tipos-componente-master). Exclusivo de ROOT, mismo criterio que
    // "Clientes" y "Ciclos" (master) — NO vive en `AdminNav` (esa sub-nav es
    // solo para secciones gateadas por `permisos` del tenant).
    visible: (_can, isGlobalAdmin) => isGlobalAdmin,
  },
  {
    href: "/compras",
    label: "Compras",
    icon: ShoppingCart,
    // Gating por MÓDULO (5.2 CAPA 3) AND permiso: además de tener el permiso,
    // el módulo COMPRAS debe estar habilitado para el usuario.
    visible: (can, _iga, canModulo) => canModulo("COMPRAS") && can("compra:gestionar"),
  },
  {
    href: "/edilicia",
    label: "Edilicia",
    icon: Wrench,
    visible: (can, _iga, canModulo) =>
      canModulo("EDILICIA") && (can("subtarea:actualizar") || can("catalogo:gestionar")),
  },
  {
    href: "/equipos",
    label: "Equipos",
    icon: Monitor,
    visible: (can, _iga, canModulo) => canModulo("EQUIPOS") && can("equipo:gestionar"),
  },
];

/**
 * Filters `NAV_ITEMS` for a given (possibly null/unauthenticated) user. ROOT
 * (`is_global_admin`) bypasses `can()` — it's a flag, not a rol, and by
 * design it can do EVERYTHING (same criterion as `useSession().can`).
 */
export function visibleNavItems(user: JwtPayload | null): NavItem[] {
  const isGlobalAdmin = user?.is_global_admin ?? false;
  const can = (permiso: string): boolean => isGlobalAdmin || (user?.permisos.includes(permiso) ?? false);
  const canModulo = (modulo: string): boolean =>
    isGlobalAdmin || (user?.modulos?.includes(modulo) ?? false);
  return NAV_ITEMS.filter((item) => item.visible(can, isGlobalAdmin, canModulo));
}
