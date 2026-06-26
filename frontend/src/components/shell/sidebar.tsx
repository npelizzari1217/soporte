"use client";

/**
 * Sidebar — persistent vertical navigation panel.
 *
 * Layout: w-72 flex-col aside with three zones:
 *   1. Header — tenant display (brand "Soporte" + user initial avatar). Read-only:
 *      no switcher or dropdown because clienteNombre is not yet in JwtPayload
 *      (follow-up change: auth-cliente-nombre). Fallback: email[0].toUpperCase().
 *   2. Nav — 4 links with Lucide icons. aria-current="page" on the active item
 *      detected via pathname.startsWith(href). Why aria-current and not a class alone:
 *      screen readers announce "current page" which is semantically correct here.
 *   3. Footer — <UserMenu> (S2 keeps the existing component; Radix upgrade is S4).
 *
 * Spec: [SPEC:frontend-shell/req 1 sidebar w-72], [SPEC:frontend-shell/req 3 nav],
 *       [SPEC:frontend-shell/req 4 tenant display], [SPEC:frontend-shell/req 7 a11y]
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ticket, ShoppingCart, Wrench, Monitor, type LucideIcon } from "lucide-react";
import { useSession } from "@/shared/hooks/use-session";
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

// ── Component ──────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useSession();

  /** First letter of the user's email, upper-cased, for the avatar fallback. */
  const userInitial = user ? user.email[0].toUpperCase() : null;

  return (
    <aside className="w-72 flex flex-col h-full min-h-screen bg-card backdrop-blur-sm border-r border-slate-200/50 dark:border-white/5">
      {/* ── Tenant display — read-only, no interactive elements ─────────── */}
      <header className="flex items-center gap-3 px-5 py-5 border-b border-slate-200/50 dark:border-white/5">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-semibold tracking-tight text-foreground truncate">
            Soporte
          </span>
        </div>
        {userInitial && (
          <span className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {userInitial}
          </span>
        )}
      </header>

      {/* ── Main navigation ────────────────────────────────────────────── */}
      <nav aria-label="Navegación principal" className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {NAV_LINKS.map(({ href, label, Icon }) => {
            /**
             * Active detection via startsWith so nested routes like /tickets/123
             * still mark the Tickets link as active. This mirrors the convention
             * already established in app-nav.tsx.
             */
            const isActive = pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={[
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
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
          })}
        </ul>
      </nav>

      {/* ── Footer — UserMenu (S4 will upgrade to Radix; kept as-is for S2) ── */}
      <div className="mt-auto border-t border-slate-200/50 dark:border-white/5 px-3 py-3">
        <UserMenu />
      </div>
    </aside>
  );
}
