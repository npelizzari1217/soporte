"use client";

/**
 * AppShell — client composition root for the authenticated dashboard tree.
 *
 * Layout: `<AppSidebar>` (nav by role) on the left + a main column with the
 * existing `<DashboardHeader>` on top, `<Breadcrumbs>` below it, and the page
 * `children`. Mobile: the sidebar becomes a fixed drawer, opened via the
 * hamburger button in the top bar; a backdrop click or Escape closes it.
 *
 * Spec: R-M0 Shell/layout premium. Design: ADR-1 (sidebar dentro de
 * `(dashboard)/layout.tsx` como `<AppShell>` envolviendo `{children}`).
 */
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { AppSidebar } from "./app-sidebar";
import { Breadcrumbs } from "./breadcrumbs";
import { DashboardHeader } from "./dashboard-header";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar — always visible, collapsible width (handled inside AppSidebar). */}
      <div className="hidden md:block">
        <AppSidebar />
      </div>

      {/* Mobile drawer — overlay + off-canvas sidebar, toggled by the hamburger button. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-50">
            <AppSidebar />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center border-b border-border">
          <button
            type="button"
            aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
            className="flex h-10 w-10 items-center justify-center text-muted-foreground hover:bg-muted transition-colors md:hidden"
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
          </button>
          <div className="flex-1">
            <DashboardHeader />
          </div>
        </div>

        <div className="border-b border-border px-6 py-2">
          <Breadcrumbs />
        </div>

        <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
