/**
 * TicketsList — PRESENTATIONAL component.
 *
 * Receives `tickets` as a prop; renders a clean table.
 * No API calls, no mutations, no routing — pure UI.
 *
 * Columns: Número · Título · Tipo · Prioridad (badge) · Estado (badge) · Fecha
 *
 * Design: Container/Presentational per design.md §1.
 * Constitution: rounded-lg for the container card, rounded-md for badges.
 * Colors: design tokens from globals.css only (no hardcoded values).
 * Spec: [SPEC:frontend-tickets/lista-tickets]
 */

import { cn } from "@/lib/utils";
import type { Ticket } from "../types";
import {
  labelFor,
  ESTADOS,
  PRIORIDADES,
  TIPOS,
  PRIORIDAD_BADGE,
} from "../lib/catalogos";

interface TicketsListProps {
  tickets: Ticket[];
}

/** Format ISO date string in Argentinean locale (dd/mm/yyyy). */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

export function TicketsList({ tickets }: TicketsListProps) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="px-4 py-3 font-medium">Número</th>
            <th className="px-4 py-3 font-medium">Título</th>
            <th className="px-4 py-3 font-medium">Tipo</th>
            <th className="px-4 py-3 font-medium">Prioridad</th>
            <th className="px-4 py-3 font-medium">Estado</th>
            <th className="px-4 py-3 font-medium">Fecha</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr
              key={ticket.id}
              className="border-b border-border last:border-0 transition-colors hover:bg-muted/50"
            >
              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                {ticket.numero}
              </td>
              <td className="px-4 py-3 font-medium text-foreground">
                {ticket.titulo}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {labelFor(TIPOS, ticket.tipoId)}
              </td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                    PRIORIDAD_BADGE[ticket.prioridadId] ??
                      "bg-muted text-muted-foreground",
                  )}
                >
                  {labelFor(PRIORIDADES, ticket.prioridadId)}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {labelFor(ESTADOS, ticket.estadoId)}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {formatDate(ticket.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
