"use client";

/**
 * FilterBar — shell container for list filters (search + slot for
 * feature-specific controls, e.g. estado/tipo/prioridad selects added per
 * module in later batches). Search is committed on Enter (uncontrolled),
 * NOT on every keystroke — the caller decides how to react (URL searchParams
 * per ADR-2).
 */
import { useState, type ReactNode, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface FilterBarProps {
  searchPlaceholder?: string;
  /**
   * Búsqueda REALMENTE aplicada hoy (la que el consumidor tiene en sus filtros,
   * o sea en la URL). Opcional: omitirlo deja la caja arrancando vacía, como
   * antes de existir el prop.
   */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  children?: ReactNode;
}

export function FilterBar({
  searchPlaceholder = "Buscar…",
  searchValue = "",
  onSearchChange,
  children,
}: FilterBarProps) {
  const [value, setValue] = useState(searchValue);
  const [searchValuePrevio, setSearchValuePrevio] = useState(searchValue);

  /**
   * El borrador se resincroniza cuando el filtro CAMBIA desde afuera, no en
   * cada render. El porqué es lo que se veía en pantalla: entrando por
   * `/kb?busqueda=foo` el listado llegaba recortado con la caja en blanco, y
   * nadie podía saber por qué faltaban filas; y al apretar «Limpiar filtros»
   * la URL quedaba limpia pero el texto viejo seguía escrito, como si el
   * botón no hubiera hecho nada.
   *
   * Se compara contra el valor externo anterior a propósito: mientras el
   * usuario tipea, `searchValue` no se mueve (la búsqueda se confirma con
   * Enter, no hay debounce), así que el borrador local nunca se pisa. Ajustar
   * el estado durante el render —y no en un efecto— evita el repintado
   * intermedio con el texto viejo.
   */
  if (searchValue !== searchValuePrevio) {
    setSearchValuePrevio(searchValue);
    setValue(searchValue);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      onSearchChange?.(value);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      {onSearchChange && (
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            role="searchbox"
            placeholder={searchPlaceholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-8"
          />
        </div>
      )}
      {children}
    </div>
  );
}
