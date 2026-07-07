"use client";

/**
 * ThemeToggle — icon button that switches between day (light) and night (dark) mode.
 *
 * Icon shows the mode you're switching TO (not the current mode):
 *   - Light mode → Moon (click to go to night)
 *   - Dark mode  → Sun  (click to go to day)
 *
 * Reuses the `Button` atom (variant="ghost" size="icon") — same icon-button
 * convention as the rest of the shell (no bespoke floating/fixed button;
 * mounted inline in the sidebar footer next to UserMenu).
 *
 * Spec: theme-toggle change brief (day/night toggle, mechanism-only — not an
 * educandow port). Design system contract stays intact (Constitution §3).
 */

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/shared/providers/theme-provider";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  // Mount-gating (anti hydration-mismatch): el servidor NO puede conocer el tema
  // real del cliente (localStorage / prefers-color-scheme), así que renderizar el
  // ícono según `theme` en SSR difiere del primer render del cliente → mismatch.
  // Hasta el mount renderizamos un ícono determinístico (Moon), idéntico en server
  // y primer render de cliente; tras el mount reflejamos el tema real. El tema
  // VISUAL ya está correcto por el FOUC script (clase .dark); esto solo alinea el
  // ícono del botón. Patrón estándar (next-themes).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && theme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={isDark ? "Cambiar a modo día" : "Cambiar a modo noche"}
    >
      {isDark ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </Button>
  );
}
