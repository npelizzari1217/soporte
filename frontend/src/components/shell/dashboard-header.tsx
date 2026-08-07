"use client";

/**
 * DashboardHeader — minimal shell top bar: tenant switcher, theme toggle, logout.
 *
 * This is intentionally minimal scaffolding (no sidebar/nav yet — the full
 * navigation shell is out of scope for PR11, gated behind the domain-feature
 * PRs that still need to land). It exists so the tenant switcher (R28) and
 * theme toggle have somewhere to live in the authenticated dashboard tree.
 *
 * Spec: [R28] Switcher en el shell.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TenantSwitcher } from "./tenant-switcher";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "@/components/ui/button";

export function DashboardHeader() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } finally {
      router.push("/login");
    }
  }

  return (
    <header className="flex items-center justify-between border-b border-slate-200/50 bg-card px-4 py-2 dark:border-white/5">
      <TenantSwitcher />
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Button variant="ghost" size="sm" disabled={isLoggingOut} onClick={handleLogout}>
          {isLoggingOut ? "Cerrando sesión…" : "Cerrar sesión"}
        </Button>
      </div>
    </header>
  );
}
