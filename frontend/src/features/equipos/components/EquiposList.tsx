/**
 * EquiposList — PRESENTATIONAL component.
 *
 * Receives `equipos` as a prop; renders a clean table.
 * No API calls, no mutations, no routing — pure UI.
 *
 * Columns: Nombre · Marca · Modelo · N° Serie · Adquisición · Estado (badge)
 *
 * activo → "Activo" (green-ish) / "Inactivo" (muted) badge.
 * Null string fields default to "—".
 *
 * Design: Container/Presentational per design.md §1.
 * Constitution: rounded-lg for the container card, rounded-md for badges.
 * Colors: design tokens from globals.css only (no hardcoded values).
 * Spec: [SPEC:frontend-equipos/lista-equipos]
 */

import { cn } from "@/lib/utils";
import type { Equipo } from "../types";

interface EquiposListProps {
  equipos: Equipo[];
}

/** Format ISO date string in Argentinean locale (dd/mm/yyyy). Returns "—" for null. */
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

/** Badge classes per activo state — uses design tokens only. */
const ACTIVO_BADGE: Record<"true" | "false", string> = {
  true: "bg-primary/15 text-primary",
  false: "bg-muted text-muted-foreground",
};

export function EquiposList({ equipos }: EquiposListProps) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="px-4 py-3 font-medium">Nombre</th>
            <th className="px-4 py-3 font-medium">Marca</th>
            <th className="px-4 py-3 font-medium">Modelo</th>
            <th className="px-4 py-3 font-medium">N° Serie</th>
            <th className="px-4 py-3 font-medium">Adquisición</th>
            <th className="px-4 py-3 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {equipos.map((equipo) => (
            <tr
              key={equipo.id}
              className="border-b border-border last:border-0 transition-colors hover:bg-muted/50"
            >
              <td className="px-4 py-3 font-medium text-foreground">
                {equipo.nombre}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {equipo.marca ?? "—"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {equipo.modelo ?? "—"}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                {equipo.numeroSerie ?? "—"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {formatDate(equipo.fechaAdquisicion)}
              </td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                    ACTIVO_BADGE[equipo.activo ? "true" : "false"],
                  )}
                >
                  {equipo.activo ? "Activo" : "Inactivo"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
