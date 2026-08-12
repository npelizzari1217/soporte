"use client";

/**
 * AppSidebar — role-driven navigation shell (ADR-1, ADR-4). Filters
 * `NAV_ITEMS` (shared/nav/nav-config.ts) through the current user's
 * permisos/is_global_admin via `visibleNavItems`, highlights the active
 * route, and collapses to a narrower rail (desktop) / hidden drawer content
 * (mobile handled by the parent shell wrapping this in a Sheet — see
 * app.shell.tsx, T0.5).
 *
 * Spec: R-M0 Shell/layout premium.
 */
import { Fragment, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/shared/hooks/use-session";
import { visibleNavSections } from "@/shared/nav/nav-config";

export function AppSidebar() {
  const { user } = useSession();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const sections = visibleNavSections(user);

  return (
    <nav
      aria-label="Navegación principal"
      className={cn(
        "flex h-full flex-col border-r border-border bg-card transition-[width] duration-200",
        collapsed ? "w-16" : "w-56",
      )}
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
        onClick={() => setCollapsed((c) => !c)}
        className="flex h-10 items-center justify-center border-b border-border text-muted-foreground hover:bg-muted transition-colors"
      >
        {collapsed ? (
          <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
        ) : (
          <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
        )}
      </button>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {sections.map((section) => {
          // Enlaza el encabezado de sección con su lista vía `aria-labelledby`
          // para que el lector de pantalla anuncie el grupo (ej. "ROOT"). Solo
          // aplica expandido: colapsado el label es un `<hr>` decorativo.
          const headingId =
            section.title !== null && !collapsed
              ? `nav-section-${section.title.toLowerCase().replace(/\s+/g, "-")}`
              : undefined;
          return (
            <Fragment key={section.title ?? "default"}>
              {section.title !== null &&
                (collapsed ? (
                  // Colapsado: el label de texto no entra en el riel angosto —
                  // un divisor fino marca el corte de sección sin romper el
                  // layout compacto.
                  <hr className="my-1 border-t border-border" aria-hidden="true" />
                ) : (
                  <span
                    id={headingId}
                    className="px-3 pt-3 text-xs font-semibold uppercase text-muted-foreground"
                  >
                    {section.title}
                  </span>
                ))}
              <ul className="flex flex-col gap-1" aria-labelledby={headingId}>
                {section.items.map((item) => {
                  const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "text-foreground hover:bg-muted",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Fragment>
          );
        })}
      </div>
    </nav>
  );
}
