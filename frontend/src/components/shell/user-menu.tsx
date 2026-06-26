"use client";

/**
 * UserMenu — displays the current user's email and a logout action.
 *
 * Why Radix DropdownMenu:
 *   The previous implementation used `{open && <div>}` with manual toggle,
 *   which lacked click-outside dismissal and ESC keyboard handling. Radix
 *   provides all of this via DismissableLayer + FocusScope:
 *     - Click outside → DismissableLayer closes automatically
 *     - ESC key → DropdownMenu.Content handles it natively
 *     - Focus management → FocusScope returns focus to trigger on close
 *     - ARIA → role="menu" / role="menuitem" / aria-expanded added automatically
 *
 * Logout flow (unchanged):
 *   1. POST /api/auth/logout  (BFF route handler — clears httpOnly cookies)
 *   2. router.push('/login')  (client-side redirect after cookies cleared)
 *
 * onSelect + e.preventDefault():
 *   Radix closes the menu by default on item selection. We prevent this to
 *   keep the menu open while the logout request is in-flight, allowing the
 *   user to see the "Cerrando sesión…" loading state.
 *
 * Radius breakdown (CONSTITUTION §3):
 *   Trigger  → rounded-md (interactive button — same as before)
 *   Content  → rounded-md (dropdown panel, 6px)
 *   Items    → rounded-sm (minimal, 2px)
 *
 * Spec: [SPEC:frontend-shell/req 5 UserMenu click-outside ESC foco]
 */

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/shared/hooks/use-session";

export function UserMenu() {
  const { user } = useSession();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
    }
  }

  if (!user) return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <span className="max-w-[180px] truncate">{user.email}</span>
          <ChevronDown className="h-4 w-4 opacity-60 shrink-0" aria-hidden />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="rounded-md border border-border bg-popover shadow-lg z-50 w-44 p-1"
          align="end"
          sideOffset={4}
        >
          <DropdownMenu.Item
            onSelect={(e) => {
              // Prevent Radix from closing the menu on selection so the
              // "Cerrando sesión…" loading state remains visible until navigation.
              e.preventDefault();
              handleLogout();
            }}
            disabled={isLoggingOut}
            className="rounded-sm px-3 py-2 text-sm cursor-pointer select-none outline-none hover:bg-muted focus:bg-muted data-[highlighted]:bg-muted data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed"
          >
            {isLoggingOut ? "Cerrando sesión…" : "Cerrar sesión"}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
