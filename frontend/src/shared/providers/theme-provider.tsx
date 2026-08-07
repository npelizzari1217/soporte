"use client";

/**
 * ThemeProvider — contexto React del toggle día/noche.
 *
 * La fuente de verdad del tema es SIEMPRE la clase `.dark` en <html> +
 * localStorage('theme') — NUNCA `prefers-color-scheme` en runtime (solo se
 * usa como fallback de la primera vez que no hay preferencia guardada, tanto
 * acá como en el script FOUC de app/layout.tsx). Ambos usan la misma función
 * pura `resolveTheme` sobre los mismos inputs, así el primer render de React
 * ya coincide con lo que el FOUC script pintó — sin flash, sin desync.
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

function readStoredPreference(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function readSystemPrefersLight(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches;
  } catch {
    return false;
  }
}

function syncDomClass(theme: Theme): void {
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }
}

function readInitialTheme(): Theme {
  const theme = resolveTheme(readStoredPreference(), readSystemPrefersLight());
  syncDomClass(theme);
  return theme;
}

function applyTheme(theme: Theme): void {
  syncDomClass(theme);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // localStorage no disponible — el tema visual igual aplica vía la clase DOM.
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
