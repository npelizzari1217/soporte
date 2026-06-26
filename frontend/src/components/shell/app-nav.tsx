"use client";

/**
 * AppNav — sidebar/top navigation for the dashboard.
 *
 * Links: Tickets · Compras · Reparaciones · Equipos
 * Uses rounded-md (6px) for nav links (interactive elements per the constitution).
 * Includes <UserMenu> for session display and logout.
 *
 * Spec: [SPEC:frontend-design-system/radios rounded-md/-lg in shell]
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "./user-menu";

const NAV_LINKS = [
  { href: "/tickets", label: "Tickets" },
  { href: "/compras", label: "Compras" },
  { href: "/reparaciones", label: "Reparaciones" },
  { href: "/equipos", label: "Equipos" },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
      {/* Brand */}
      <div className="flex items-center gap-6">
        <span className="text-sm font-semibold tracking-tight text-foreground">
          Soporte
        </span>

        {/* Nav links */}
        <ul className="flex items-center gap-1" role="list">
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={[
                    "rounded-md px-3 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-muted text-foreground font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  ].join(" ")}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* User menu */}
      <UserMenu />
    </nav>
  );
}
