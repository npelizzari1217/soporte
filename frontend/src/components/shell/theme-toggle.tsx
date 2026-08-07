"use client";

/**
 * ThemeToggle — botón de ícono que alterna entre modo día (light) y noche (dark).
 *
 * El ícono muestra el modo AL QUE SE CAMBIA (no el actual):
 *   - Modo claro → Luna (click pasa a modo noche)
 *   - Modo oscuro → Sol (click pasa a modo día)
 */

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/shared/providers/theme-provider";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  // Mount-gating anti hydration-mismatch: el servidor no conoce el tema real
  // del cliente (localStorage), así que hasta el mount se renderiza un ícono
  // determinístico (Moon), idéntico en SSR y en el primer render del cliente.
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
