"use client";

/**
 * FiltrosBar — PRESENTATIONAL filter bar for the tickets list.
 *
 * Renders 3 tipo checkboxes + date range inputs.
 * Purely controlled: receives `filtros` + `onChange` callback.
 * Does NOT own any state or network calls — the container (TicketsPage) owns both.
 *
 * Behavior:
 *   - Tipo checkboxes toggle tipos in filtros.tiposIds.
 *     Empty tiposIds (or undefined) = all tipos shown (no filter).
 *   - Date inputs feed fechaDesde / fechaHasta as 'YYYY-MM-DD' strings.
 *   - When isLoadingCiclo=true, date inputs are replaced by skeleton placeholders.
 *     Tipo checkboxes remain interactive (they don't depend on ciclo).
 *   - When ciclo is null and isLoadingCiclo=false, date inputs render with empty values.
 *
 * Design: CONSTITUTION §3 — glassmorphism dual claro/oscuro, inputs rounded-xl,
 * skeleton tenue durante carga del ciclo.
 *
 * Spec: ADR-7, ADR-8 (tickets-list-filtros-resolucion)
 */

import { Skeleton } from "@/components/ui/skeleton";
import type { CicloActivo, TicketFiltros } from "../types";

export interface FiltrosBarProps {
  filtros: TicketFiltros;
  onChange: (f: TicketFiltros) => void;
  ciclo: CicloActivo | null;
  isLoadingCiclo: boolean;
  tiposDisponibles: Array<{ id: string; nombre: string }>;
}

export function FiltrosBar({
  filtros,
  onChange,
  isLoadingCiclo,
  tiposDisponibles,
}: FiltrosBarProps) {
  const selectedTipos = filtros.tiposIds ?? [];

  /** Toggle a tipo UUID in/out of the tiposIds filter array. */
  function handleTipoChange(tipoId: string, checked: boolean) {
    const next = checked
      ? [...selectedTipos, tipoId]
      : selectedTipos.filter((id) => id !== tipoId);
    onChange({ ...filtros, tiposIds: next });
  }

  function handleDesdeChange(value: string) {
    onChange({ ...filtros, fechaDesde: value || undefined });
  }

  function handleHastaChange(value: string) {
    onChange({ ...filtros, fechaHasta: value || undefined });
  }

  return (
    <div
      data-testid="filtros-bar"
      className={[
        "flex flex-wrap items-end gap-4 p-4 rounded-lg border",
        // Glassmorphism dual (CONSTITUTION §3)
        "bg-card/60 backdrop-blur-sm",
        "border-slate-200/50 dark:border-white/5",
      ].join(" ")}
    >
      {/* ── Tipo checkboxes ─────────────────────────────────────────────────── */}
      <fieldset className="flex flex-col gap-1">
        <legend className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
          Tipo
        </legend>
        <div className="flex flex-wrap gap-3">
          {tiposDisponibles.map((tipo) => {
            const checked = selectedTipos.includes(tipo.id);
            return (
              <label
                key={tipo.id}
                className="flex items-center gap-1.5 cursor-pointer select-none text-sm"
              >
                <input
                  type="checkbox"
                  className="rounded accent-primary"
                  checked={checked}
                  onChange={(e) => handleTipoChange(tipo.id, e.target.checked)}
                  aria-label={tipo.nombre}
                />
                <span>{tipo.nombre}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* ── Date range ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        {/* Desde */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="filtro-fecha-desde"
            className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
          >
            Desde
          </label>
          {isLoadingCiclo ? (
            <Skeleton className="h-9 w-36 rounded-xl" />
          ) : (
            <input
              id="filtro-fecha-desde"
              type="date"
              value={filtros.fechaDesde ?? ""}
              onChange={(e) => handleDesdeChange(e.target.value)}
              className={[
                "h-9 rounded-xl border border-slate-200/50 dark:border-white/5",
                "bg-background px-3 text-sm text-foreground",
                "focus:outline-none focus:ring-2 focus:ring-primary/50",
                "transition-all duration-200",
              ].join(" ")}
            />
          )}
        </div>

        {/* Hasta */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="filtro-fecha-hasta"
            className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
          >
            Hasta
          </label>
          {isLoadingCiclo ? (
            <Skeleton className="h-9 w-36 rounded-xl" />
          ) : (
            <input
              id="filtro-fecha-hasta"
              type="date"
              value={filtros.fechaHasta ?? ""}
              onChange={(e) => handleHastaChange(e.target.value)}
              className={[
                "h-9 rounded-xl border border-slate-200/50 dark:border-white/5",
                "bg-background px-3 text-sm text-foreground",
                "focus:outline-none focus:ring-2 focus:ring-primary/50",
                "transition-all duration-200",
              ].join(" ")}
            />
          )}
        </div>
      </div>
    </div>
  );
}
