/**
 * ComprasList — PRESENTATIONAL component.
 *
 * Receives `compras` as a prop; renders a clean table.
 * No API calls, no mutations, no routing — pure UI.
 *
 * Columns: Número · Título · Estado (badge) · Aprobación · Fecha
 *
 * Aprobación logic:
 *   - aprobadoEn → "Aprobada {fecha}"
 *   - motivoRechazo → "Rechazada" + motivo as muted text
 *   - neither → "—"
 *
 * Design: Container/Presentational per design.md §1.
 * Constitution: rounded-lg for the container card, rounded-md for badges.
 * Colors: design tokens from globals.css only (no hardcoded values).
 * Spec: [SPEC:frontend-compras/lista-compras]
 */

import type { Compra } from "../types";
import { labelFor, ESTADOS } from "@/shared/lib/catalogos";

interface ComprasListProps {
  compras: Compra[];
}

/** Format ISO date string in Argentinean locale (dd/mm/yyyy). */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

/** Render the aprobación column content.
 * A rejected compra carries BOTH motivoRechazo AND aprobadoEn (aprobadoEn = who
 * processed it), so check rejection FIRST — otherwise a rejected purchase would
 * mislabel as "Aprobada". */
function AprobacionCell({ compra }: { compra: Compra }) {
  if (compra.motivoRechazo) {
    return (
      <span className="text-foreground">
        Rechazada{" "}
        <span className="text-muted-foreground text-xs" title={compra.motivoRechazo}>
          ({compra.motivoRechazo})
        </span>
      </span>
    );
  }
  if (compra.aprobadoEn) {
    return (
      <span className="text-foreground">
        Aprobada {formatDate(compra.aprobadoEn)}
      </span>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

export function ComprasList({ compras }: ComprasListProps) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="px-4 py-3 font-medium">Número</th>
            <th className="px-4 py-3 font-medium">Título</th>
            <th className="px-4 py-3 font-medium">Estado</th>
            <th className="px-4 py-3 font-medium">Aprobación</th>
            <th className="px-4 py-3 font-medium">Fecha</th>
          </tr>
        </thead>
        <tbody>
          {compras.map((compra) => (
            <tr
              key={compra.id}
              className="border-b border-border last:border-0 transition-colors hover:bg-muted/50"
            >
              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                {compra.numero}
              </td>
              <td className="px-4 py-3 font-medium text-foreground">
                {compra.titulo}
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {labelFor(ESTADOS, compra.estadoId)}
                </span>
              </td>
              <td className="px-4 py-3 text-sm">
                <AprobacionCell compra={compra} />
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {formatDate(compra.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
