"use client";

/**
 * AppShell — responsive layout shell that wraps all dashboard pages.
 *
 * Desktop (≥ md/768px): sidebar visible inline (hidden md:flex), no hamburger visible.
 * Mobile  (< md/768px): sidebar hidden; hamburger button opens a drawer overlay.
 *
 * Drawer accessibility:
 *   - role="dialog" + aria-modal="true": announces overlay context to screen readers.
 *   - ESC closes the drawer AND returns focus to the hamburger button. Why: ARIA
 *     Authoring Practices (APG §3.4) requires focus to return to the trigger that
 *     opened the dialog so users don't lose their place in the page flow.
 *   - Click on the backdrop overlay also closes the drawer.
 *   - Route changes auto-close the drawer (via useEffect on pathname) so the drawer
 *     doesn't linger after the user taps a link inside it.
 *
 * Spec: [SPEC:frontend-shell/req 2 flex-row layout], [SPEC:frontend-shell/req 6 responsive drawer],
 *       [SPEC:frontend-shell/req 7 accesibilidad]
 */

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Sidebar } from "./sidebar";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  /**
   * ref to the hamburger button so we can return focus to it after closing the
   * drawer (required for keyboard-only and screen-reader users).
   */
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // ── ESC handler ────────────────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        setOpen(false);
        /**
         * Return focus to the trigger that opened the dialog.
         * This satisfies ARIA APG §3.4 "Dialog (Modal)" focus management:
         * when a dialog closes, focus must return to the element that had focus
         * before the dialog was opened.
         */
        hamburgerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // ── Route change handler ───────────────────────────────────────────────
  useEffect(() => {
    /**
     * Close the drawer whenever the route changes. This handles the case where
     * the user taps a nav link inside the mobile drawer — the drawer should
     * dismiss immediately as part of the navigation transition.
     */
    setOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Sidebar — visible on desktop, hidden on mobile (CSS-only, no JS toggle) */}
      <div className="hidden md:flex w-72 flex-shrink-0">
        <Sidebar />
      </div>

      {/* Hamburger — visible only on mobile (CSS-only) */}
      <button
        ref={hamburgerRef}
        type="button"
        aria-label="Abrir menú"
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-4 left-4 z-30 flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Drawer + overlay — only rendered when open (mobile) */}
      {open && (
        <>
          {/* Backdrop overlay — clicking it closes the drawer */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          {/* Drawer panel */}
          <div
            role="dialog"
            aria-modal="true"
            className="fixed left-0 inset-y-0 z-50 w-72"
          >
            <Sidebar />
          </div>
        </>
      )}

      {/* Main content area */}
      <main className="flex-1 overflow-auto px-6 py-6">{children}</main>
    </div>
  );
}
