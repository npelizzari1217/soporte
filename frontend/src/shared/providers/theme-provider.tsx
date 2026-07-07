"use client";

/**
 * ThemeProvider — React context wrapper around the day/night toggle mechanism.
 *
 * Design note — SAME resolution formula as the FOUC script:
 *   The FOUC script inline in app/layout.tsx (head) computes the theme from
 *   localStorage('theme') + prefers-color-scheme BEFORE first paint, and
 *   applies `.dark` on <html> synchronously. This provider's initial React
 *   state is computed with the exact same pure function (`resolveTheme`, from
 *   shared/theme/resolve-theme.ts) over the exact same inputs, so the very
 *   first render already matches what's visually on screen — no flash, no
 *   desync, no extra `useEffect` correction pass needed.
 *
 * Persistence: reuses the SAME localStorage key ('theme') the FOUC script
 * reads — do not introduce a second key.
 *
 * Default context value pattern: follows the same convention as
 * TenantContext (shared/providers/tenant-context.tsx) — a sensible no-op
 * default instead of throwing when used outside a Provider. This keeps
 * consumers (e.g. Sidebar tests that don't wrap in <ThemeProvider>) safe.
 */

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { resolveTheme } from "@/shared/theme/resolve-theme";

export type Theme = "light" | "dark";

export interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
}

const THEME_STORAGE_KEY = "theme";

const defaultValue: ThemeContextValue = {
  theme: "dark",
  toggle: () => {},
  setTheme: () => {},
};

export const ThemeContext = createContext<ThemeContextValue>(defaultValue);

/** Reads the stored preference, tolerating environments without localStorage (SSR, sandboxed iframes). */
function readStoredPreference(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Reads the system preference, tolerating environments without matchMedia (SSR, jsdom without a mock). */
function readSystemPrefersLight(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches;
  } catch {
    return false;
  }
}

/** Mutates the DOM to reflect the theme (.dark class strategy). Idempotent. */
function syncDomClass(theme: Theme): void {
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }
}

/**
 * Same inputs, same pure function as the FOUC script — guarantees identical
 * output. Also defensively re-syncs the DOM class on mount: harmless/idempotent
 * when the FOUC script already applied it, and self-healing for any consumer
 * that mounts ThemeProvider without that script having run first.
 */
function readInitialTheme(): Theme {
  const theme = resolveTheme(readStoredPreference(), readSystemPrefersLight());
  syncDomClass(theme);
  return theme;
}

/** Applies the theme to the DOM (.dark class strategy) and persists it. */
function applyTheme(theme: Theme): void {
  syncDomClass(theme);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // localStorage unavailable — the visual theme still applies via the DOM class.
    }
  }
}

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => readInitialTheme());

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    setThemeState(next);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((current) => {
      const next = current === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, toggle, setTheme }),
    [theme, toggle, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
