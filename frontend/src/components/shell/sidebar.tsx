"use client";

/**
 * Sidebar — persistent vertical navigation panel.
 *
 * Layout: w-72 flex-col aside with four zones:
 *   1. Header — tenant display. Shows tenant name from JWT claim cliente_nombre;
 *      falls back to brand 'Soporte' for legacy tokens. Read-only: no switcher or
 *      dropdown. Avatar: email[0].toUpperCase().
 *   2. Selectors (admin-general PR5b) — ClienteSelector + CicloSelector, above all
 *      navigation. Each gates itself by role (see their own docblocks); rendered
 *      only when the admin panel feature flag is on AND the user is operador
 *      global or ADMINISTRADOR.
 *   3. Nav — ADMINISTRACIÓN section (conditional, admin-general PR5b) followed by
 *      the 4 operational links with Lucide icons. aria-current="page" on the
 *      active item, detected via pathname.startsWith(href). Why aria-current and
 *      not a class alone: screen readers announce "current page" which is
 *      semantically correct here.
 *   4. Footer — <UserMenu> (S2 keeps the existing component; Radix upgrade is S4).
 *
 * ADMINISTRACIÓN section (admin-general PR5b, T5.12-T5.13):
 *   Container pattern — reads useSession({ isGlobalAdmin, user.roles }) to decide
 *   what to render; TenantContext-dependent selectors are delegated to their own
 *   components. Gated by `NEXT_PUBLIC_ADMIN_PANEL === 'true'` — without the flag
 *   the sidebar renders EXACTLY as before (no-regression), regardless of role.
 *   - is_global_admin: true   → Clientes, Ciclos, Usuarios, Reportes
 *   - ADMINISTRADOR (rol) only → Ciclos, Usuarios, Reportes (sin Clientes)
 *   - resto de roles          → sin sección, sin divider, 4 ítems operativos intactos
 *
 * Spec: [SPEC:frontend-shell/req 1 sidebar w-72], [SPEC:frontend-shell/req 3 nav],
 *       [SPEC:frontend-shell/req 4 tenant display], [SPEC:frontend-shell/req 7 a11y]
 *       [SPEC:admin-ui/Sección ADMINISTRACIÓN en sidebar condicional por nivel]
 *       [SPEC:admin-ui/Selectores Cliente + Ciclo sobre la navegación del sidebar]
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Ticket,
  ShoppingCart,
  Wrench,
  Monitor,
  Building2,
  CalendarRange,
  Users,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import { useContext } from "react";
import { useSession } from "@/shared/hooks/use-session";
import { TenantContext } from "@/shared/providers/tenant-context";
import { ClienteSelector } from "@/features/admin/components/ClienteSelector";
import { CicloSelector } from "@/features/admin/components/CicloSelector";
import { UserMenu } from "./user-menu";

// ── Nav link definitions ───────────────────────────────────────────────────

interface NavLink {
  href: string;
  label: string;
  Icon: LucideIcon;
}

const NAV_LINKS: NavLink[] = [
  { href: "/tickets", label: "Tickets", Icon: Ticket },
  { href: "/compras", label: "Compras", Icon: ShoppingCart },
  { href: "/reparaciones", label: "Reparaciones", Icon: Wrench },
  { href: "/equipos", label: "Equipos", Icon: Monitor },
];

/** Sección ADMINISTRACIÓN — operador global (is_global_admin: true): 4 ítems. */
const ADMIN_LINKS_OPERADOR: NavLink[] = [
  { href: "/admin/clientes", label: "Clientes", Icon: Building2 },
  { href: "/admin/ciclos", label: "Ciclos", Icon: CalendarRange },
  { href: "/admin/usuarios", label: "Usuarios", Icon: Users },
  { href: "/admin/reportes", label: "Reportes", Icon: BarChart3 },
];

/** Sección ADMINISTRACIÓN — ADMINISTRADOR (is_global_admin: false): sin Clientes. */
const ADMIN_LINKS_ADMINISTRADOR: NavLink[] = [
  { href: "/admin/ciclos", label: "Ciclos", Icon: CalendarRange },
  { href: "/admin/usuarios", label: "Usuarios", Icon: Users },
  { href: "/admin/reportes", label: "Reportes", Icon: BarChart3 },
];

interface NavItemProps extends NavLink {
  /**
   * Operador-only, T5.16-T5.17: true while the operador hasn't picked a
   * cliente yet (TenantContext.clienteId === null). The link stays visible
   * (spec allows "deshabilitados o ausentes"; we chose visually-disabled for
   * discoverability) but is non-interactive and unfocusable.
   */
  disabled?: boolean;
}

/**
 * Renders a single nav <li>/<Link>. Shared between the ADMINISTRACIÓN section
 * and the operational section so both follow the exact same active/style rules.
 */
function NavItem({ href, label, Icon, disabled }: NavItemProps) {
  const pathname = usePathname();
  // Active detection via startsWith so nested routes like /tickets/123 still
  // mark the Tickets link as active. Mirrors the convention in app-nav.tsx.
  const isActive = pathname.startsWith(href);
  return (
    <li>
      <Link
        href={href}
        aria-current={isActive ? "page" : undefined}
        aria-disabled={disabled ? "true" : undefined}
        tabIndex={disabled ? -1 : undefined}
        onClick={disabled ? (e) => e.preventDefault() : undefined}
        className={[
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
          disabled
            ? "pointer-events-none opacity-40 text-muted-foreground"
            : isActive
              ? "bg-muted text-foreground font-medium"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
        ].join(" ")}
      >
        {/* aria-hidden: icon is decorative — the link text already conveys meaning */}
        <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        {label}
      </Link>
    </li>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export function Sidebar() {
  const { user, isGlobalAdmin } = useSession();
  const { clienteId } = useContext(TenantContext);

  /** First letter of the user's email, upper-cased, for the avatar fallback. */
  const userInitial = user ? user.email[0].toUpperCase() : null;

  const adminPanelEnabled = process.env.NEXT_PUBLIC_ADMIN_PANEL === "true";
  const isAdministrador = user?.roles.includes("ADMINISTRADOR") ?? false;
  const showAdminSection = adminPanelEnabled && (isGlobalAdmin || isAdministrador);
  const adminLinks = isGlobalAdmin ? ADMIN_LINKS_OPERADOR : ADMIN_LINKS_ADMINISTRADOR;

  // T5.16-T5.17: operador global sin cliente seleccionado aún → nav operativa
  // deshabilitada (spec admin-ui/Estado "Elegí un cliente"). Gated by the same
  // feature flag so a disabled flag never changes existing behavior.
  const operativeNavDisabled = adminPanelEnabled && isGlobalAdmin && !clienteId;

  return (
    <aside className="w-72 flex flex-col h-full min-h-screen bg-card backdrop-blur-sm border-r border-slate-200/50 dark:border-white/5">
      {/* ── Tenant display — read-only, no interactive elements ─────────── */}
      <header className="flex items-center gap-3 px-5 py-5 border-b border-slate-200/50 dark:border-white/5">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-semibold tracking-tight text-foreground truncate">
            {user?.cliente_nombre || 'Soporte'}
          </span>
        </div>
        {userInitial && (
          <span className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {userInitial}
          </span>
        )}
      </header>

      {/* ── Cliente + Ciclo selectors (admin-general PR5b) — above all nav ── */}
      {showAdminSection && (
        <div className="space-y-3 px-3 pt-4">
          <ClienteSelector />
          <CicloSelector />
        </div>
      )}

      {/* ── Main navigation ────────────────────────────────────────────── */}
      <nav aria-label="Navegación principal" className="flex-1 px-3 py-4">
        {showAdminSection && (
          <div className="mb-4">
            <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Administración
            </p>
            <ul className="space-y-1">
              {adminLinks.map((link) => (
                <NavItem key={link.href} {...link} />
              ))}
            </ul>
            <div
              data-testid="admin-divider"
              className="mt-4 border-t border-slate-200/50 dark:border-white/5"
            />
          </div>
        )}
        <ul className="space-y-1">
          {NAV_LINKS.map((link) => (
            <NavItem key={link.href} {...link} disabled={operativeNavDisabled} />
          ))}
        </ul>
      </nav>

      {/* ── Footer — UserMenu (S4 will upgrade to Radix; kept as-is for S2) ── */}
      <div className="mt-auto border-t border-slate-200/50 dark:border-white/5 px-3 py-3">
        <UserMenu />
      </div>
    </aside>
  );
}
