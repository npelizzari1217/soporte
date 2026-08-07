import type { LucideIcon } from "lucide-react";
import { Ticket, LayoutDashboard, BookOpen, Settings, Building2, ShoppingCart, Wrench, Monitor } from "lucide-react";
import type { JwtPayload } from "@/shared/api/types";

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
  visible: (can: (permiso: string) => boolean, isGlobalAdmin: boolean) => boolean;
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
    visible: (can) =>
      can("catalogo:gestionar") || can("cliente:gestionar") || can("ciclo:gestionar") || can("usuario:gestionar"),
  },
  {
    href: "/admin/clientes",
    label: "Clientes",
    icon: Building2,
    visible: (_can, isGlobalAdmin) => isGlobalAdmin,
  },
  {
    href: "/compras",
    label: "Compras",
    icon: ShoppingCart,
    visible: (can) => can("compra:gestionar"),
  },
  {
    href: "/edilicia",
    label: "Edilicia",
    icon: Wrench,
    visible: (can) => can("subtarea:actualizar") || can("catalogo:gestionar"),
  },
  {
    href: "/equipos",
    label: "Equipos",
    icon: Monitor,
    visible: (can) => can("equipo:gestionar"),
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
  return NAV_ITEMS.filter((item) => item.visible(can, isGlobalAdmin));
}
