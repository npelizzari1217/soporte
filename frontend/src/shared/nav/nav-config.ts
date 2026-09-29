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
  ClipboardCheck,
  Tag,
  Package,
  Cog,
  PartyPopper,
  Clock,
} from "lucide-react";
import type { JwtPayload } from "@/shared/api/types";
import { ETIQUETAS_MODULOS } from "@/shared/auth/etiquetas-modulos";

/**
 * nav-config — single source of truth for the sidebar navigation (ADR-4).
 *
 * Each item declares WHO can see it via `visible(can, isGlobalAdmin,
 * canModulo, esAdminCliente)`, driven by la matriz de permisos
 * (`sdd/matriz-permisos-por-usuario`). The sidebar (and any other consumer)
 * filters `NAV_ITEMS` through this predicate — no duplicated gating logic
 * elsewhere. Gating here is UI-only; the backend remains the real authority
 * (ADR-4).
 */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  visible: (
    can: (permiso: string) => boolean,
    isGlobalAdmin: boolean,
    canModulo: (modulo: string) => boolean,
    esAdminCliente: boolean,
  ) => boolean;
}

/**
 * NavSection — agrupa ítems bajo un encabezado opcional (`title`). `title:
 * null` es la sección "default" (sin header visual, top-level). `visible`
 * es un gate a nivel de SECCIÓN (ej. "ROOT" completa solo para
 * `is_global_admin`); además, cada ítem sigue filtrando por su propio
 * `visible` (permisos/módulo) — ambos gates aplican (AND).
 */
export interface NavSection {
  title: string | null;
  visible?: (isGlobalAdmin: boolean) => boolean;
  items: NavItem[];
}

// Los ítems que representan un módulo de la matriz de permisos toman su
// etiqueta de `ETIQUETAS_MODULOS` (fuente única): así el módulo se llama igual
// acá que en la grilla del ABM de usuarios, sin repetir el string en dos
// archivos. Los ítems que NO son módulos (Admin, Clientes, …) llevan su label
// literal.
const DEFAULT_SECTION_ITEMS: NavItem[] = [
  {
    href: "/tickets",
    label: ETIQUETAS_MODULOS.TICKETS,
    icon: Ticket,
    visible: () => true,
  },
  {
    href: "/dashboard",
    label: ETIQUETAS_MODULOS.DASHBOARD,
    icon: LayoutDashboard,
    visible: (can) => can("DASHBOARD:LECTURA"),
  },
  {
    href: "/kb",
    label: ETIQUETAS_MODULOS.KB,
    icon: BookOpen,
    visible: () => true,
  },
  {
    href: "/admin/catalogos",
    label: "Admin",
    icon: Settings,
    // ADR-P5 (sdd/matriz-permisos-por-usuario): la configuración (usuarios/
    // ciclos/catálogos) dejó de tener permiso RBAC propio — es un chequeo de
    // identidad, mismo criterio que `AdminClienteGuard`/`esAdminDeCliente`.
    visible: (_can, _iga, _canModulo, esAdminCliente) => esAdminCliente,
  },
  {
    href: "/compras",
    label: ETIQUETAS_MODULOS.COMPRAS,
    icon: ShoppingCart,
    // El eje de módulos deja de ser independiente: tener COMPRAS:LECTURA ya
    // implica tener el módulo (R2, `modulos` derivado de `permisos`) — los
    // dos AND de antes colapsan a un solo `can(...)`.
    visible: (can) => can("COMPRAS:LECTURA"),
  },
  {
    href: "/edilicia",
    label: ETIQUETAS_MODULOS.EDILICIA,
    icon: Wrench,
    visible: (can) => can("EDILICIA:LECTURA"),
  },
  {
    href: "/equipos",
    label: ETIQUETAS_MODULOS.EQUIPOS,
    icon: Monitor,
    visible: (can) => can("EQUIPOS:LECTURA"),
  },
  {
    href: "/insumos",
    label: ETIQUETAS_MODULOS.INSUMOS,
    icon: Package,
    visible: (can) => can("INSUMOS:LECTURA"),
  },
  {
    href: "/repuestos",
    // Literal, NO de `ETIQUETAS_MODULOS`: "Repuestos" no es un módulo propio
    // de la matriz de permisos (WU-2, sdd/repuestos-seccion, decisión del
    // dueño del repo) — es una segunda sección del catálogo de insumos,
    // gateada por el MISMO `INSUMOS:LECTURA` que la fila de arriba. Mismo
    // criterio que el ítem "Admin", que tampoco sale de ese mapa.
    label: "Repuestos",
    icon: Cog,
    visible: (can) => can("INSUMOS:LECTURA"),
  },
  {
    href: "/preventivo",
    label: ETIQUETAS_MODULOS.PREVENTIVO,
    icon: ClipboardCheck,
    visible: (can) => can("PREVENTIVO:LECTURA"),
  },
  {
    href: "/feriados",
    label: "Feriados",
    icon: PartyPopper,
    // Lista combinada (global + propios del tenant, task 8.1, WU8a,
    // sdd/feriados-configurables). `visible: () => true`, mismo criterio que
    // Tickets/KB arriba: `spec.md` ("Per-client admin manages its own
    // holidays; other roles read") exige lectura abierta a CUALQUIER
    // autenticado del tenant — NUNCA gateado por `esAdminCliente`. Desviación
    // declarada de design.md D8, que proponía `/admin/feriados` en `AdminNav`
    // (gate por `esAdminCliente`): ese gate bloquearía la lectura a un actor
    // no-admin, violando el requerimiento. Razón completa en
    // apply-progress.md (WU8a). La escritura (WU8b) sigue gateada por
    // `esAdminCliente`, dentro de la vista, no acá.
    visible: () => true,
  },
  {
    href: "/horario-laboral",
    label: "Horario laboral",
    icon: Clock,
    // sdd/horario-laboral-por-cliente, WU-7. Lectura abierta a CUALQUIER
    // autenticado del tenant (Requirement "Permisos de edición y lectura",
    // spec.md) — mismo criterio que Tickets/KB/Feriados arriba, NUNCA
    // gateado por `esAdminCliente`. La escritura (WU-8b) sigue gateada por
    // `esAdminCliente` dentro de la vista, no acá.
    visible: () => true,
  },
];

const ROOT_SECTION_ITEMS: NavItem[] = [
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
    href: "/admin/feriados-globales",
    label: "Feriados nacionales",
    icon: PartyPopper,
    // Catálogo MASTER de feriados nacionales (ABM del ROOT,
    // sdd/feriados-configurables, D8 design.md, task 6.4 movida a WU7).
    // Exclusivo de ROOT, mismo criterio que "Clientes", "Ciclos" y "Tipos de
    // componente" — distinto de `/feriados` (WU8a, más abajo en
    // `DEFAULT_SECTION_ITEMS`, lista combinada global+cliente abierta a
    // cualquier autenticado del tenant, no gateada por `esAdminCliente`).
    visible: (_can, isGlobalAdmin) => isGlobalAdmin,
  },
];

/**
 * NAV_SECTIONS — single source of truth for the sidebar navigation (ADR-4),
 * agrupada. La sección "ROOT" agrupa los 3 ítems exclusivos de plataforma
 * (Clientes, Ciclos master, Tipos de componente) bajo un header visible SOLO
 * para `is_global_admin`; el resto vive en la sección default (sin header).
 */
export const NAV_SECTIONS: NavSection[] = [
  { title: null, items: DEFAULT_SECTION_ITEMS },
  { title: "ROOT", visible: (isGlobalAdmin) => isGlobalAdmin, items: ROOT_SECTION_ITEMS },
];

/**
 * NAV_ITEMS — vista plana de `NAV_SECTIONS`, para consumidores que no
 * necesitan la agrupación (ej. `Breadcrumbs`, que solo busca por `href`).
 */
export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

/**
 * Filters `NAV_SECTIONS` for a given (possibly null/unauthenticated) user.
 * ROOT (`is_global_admin`) bypasses `can()` — it's a flag, not a rol, and by
 * design it can do EVERYTHING (same criterion as `useSession().can`).
 *
 * Drops sections whose section-level `visible` is false, AND sections left
 * with zero items after the item-level filter (avoids rendering an empty
 * header).
 */
export function visibleNavSections(user: JwtPayload | null): NavSection[] {
  const isGlobalAdmin = user?.is_global_admin ?? false;
  const can = (permiso: string): boolean => isGlobalAdmin || (user?.permisos.includes(permiso) ?? false);
  const canModulo = (modulo: string): boolean =>
    isGlobalAdmin || (user?.modulos?.includes(modulo) ?? false);
  // ADR-P5: mismo criterio que `useSession().esAdminCliente`, derivado acá
  // porque esta función no es un hook (consume el payload directo).
  const esAdminCliente = isGlobalAdmin || user?.rol === "ADMINISTRADOR";

  return NAV_SECTIONS.filter((section) => section.visible?.(isGlobalAdmin) ?? true)
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.visible(can, isGlobalAdmin, canModulo, esAdminCliente)),
    }))
    .filter((section) => section.items.length > 0);
}

/**
 * Filters `NAV_ITEMS` for a given (possibly null/unauthenticated) user.
 * Vista plana de `visibleNavSections` — se mantiene por compatibilidad con
 * consumidores/tests que no necesitan la agrupación por sección.
 */
export function visibleNavItems(user: JwtPayload | null): NavItem[] {
  return visibleNavSections(user).flatMap((section) => section.items);
}
