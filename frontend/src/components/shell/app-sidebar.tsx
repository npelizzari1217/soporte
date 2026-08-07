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
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/shared/hooks/use-session";
import { visibleNavItems } from "@/shared/nav/nav-config";

export function AppSidebar() {
  const { user } = useSession();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const items = visibleNavItems(user);

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

      <ul className="flex flex-1 flex-col gap-1 p-2">
        {items.map((item) => {
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
    </nav>
  );
}
