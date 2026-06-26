/**
 * ReparacionesList — PRESENTATIONAL component.
 *
 * Receives `reparaciones` as a prop; renders a clean table.
 * No API calls, no mutations, no routing — pure UI.
 *
 * Columns: Número · Título · Ubicación · Avance · Estado (badge) · Fecha
 *
 * Design: Container/Presentational per design.md §1.
 * Constitution: rounded-lg for the container card, rounded-md for badges.
 * Colors: design tokens from globals.css only (no hardcoded values).
 * Spec: [SPEC:frontend-reparaciones/lista-reparaciones]
 */

import type { Reparacion } from "../types";
import { labelFor, ESTADOS } from "@/shared/lib/catalogos";

interface ReparacionesListProps {
  reparaciones: Reparacion[];
}

/** Format ISO date string in Argentinean locale (dd/mm/yyyy). */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

/** Progress bar with text percentage. */
function AvanceCell({ porcentaje }: { porcentaje: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 overflow-hidden rounded-full bg-muted h-1.5">
        <div
          className="h-1.5 rounded-full bg-primary transition-all"
          style={{ width: `${porcentaje}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{porcentaje}%</span>
    </div>
  );
}

export function ReparacionesList({ reparaciones }: ReparacionesListProps) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="px-4 py-3 font-medium">Número</th>
            <th className="px-4 py-3 font-medium">Título</th>
            <th className="px-4 py-3 font-medium">Ubicación</th>
            <th className="px-4 py-3 font-medium">Avance</th>
            <th className="px-4 py-3 font-medium">Estado</th>
            <th className="px-4 py-3 font-medium">Fecha</th>
          </tr>
        </thead>
        <tbody>
          {reparaciones.map((rep) => (
            <tr
              key={rep.id}
              className="border-b border-border last:border-0 transition-colors hover:bg-muted/50"
            >
              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                {rep.numero}
              </td>
              <td className="px-4 py-3 font-medium text-foreground">
                {rep.titulo}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {rep.ubicacionNombre ?? "—"}
              </td>
              <td className="px-4 py-3">
                <AvanceCell porcentaje={rep.porcentajeAvance} />
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {labelFor(ESTADOS, rep.estadoId)}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {formatDate(rep.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
