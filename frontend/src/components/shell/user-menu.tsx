"use client";

/**
 * UserMenu — displays the current user's email and a logout action.
 *
 * Logout flow:
 *   1. POST /api/auth/logout  (BFF route handler — clears httpOnly cookies)
 *   2. router.push('/login')  (client-side redirect after cookies cleared)
 *
 * Uses rounded-md (6px) per the constitution — interactive dropdown elements.
 *
 * Spec: [SPEC:frontend-auth/logout], [SPEC:frontend-design-system/radios rounded-md botones]
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/shared/hooks/use-session";

export function UserMenu() {
  const { user } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="max-w-[180px] truncate">{user.email}</span>
        <svg
          className="h-4 w-4 opacity-60"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-44 rounded-md border border-border bg-card shadow-lg z-50">
          <div className="p-1">
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="w-full rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {isLoggingOut ? "Cerrando sesión…" : "Cerrar sesión"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
