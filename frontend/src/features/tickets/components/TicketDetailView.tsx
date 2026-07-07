/**
 * TicketDetailView — PRESENTATIONAL print-root component.
 *
 * Receives `ticket` by prop. Pure read-only render — no fetch, no mutations,
 * no permission gating (that lives in TicketDetailContainer, PR3). Renders
 * numero/titulo/descripcion, tipo/estado/prioridad badges (label + tone from
 * `@/shared/lib/catalogos`), and fechas es-AR via the feature-local `formatDate`.
 *
 * `data-ticket-print` marks this component's root as the print whitelist
 * subtree (ADR-1). The action toolbar (Volver/Modificar/Eliminar/Imprimir)
 * MUST be rendered by the container OUTSIDE this component so it's excluded
 * from `@media print` automatically.
 *
 * Design: design.md §"Estructura Container/Presentational" (TicketDetailView), ADR-1.
 * Spec: [SPEC:ticket-detail/renderizado-de-datos-del-ticket]
 * Spec: [SPEC:ticket-detail/aislamiento-estructural-de-la-vista-de-impresion]
 */

import type { ReactNode } from 'react'
import {
  labelFor,
  ESTADOS,
  PRIORIDADES,
  TIPOS,
  ESTADO_TONE,
  PRIORIDAD_TONE,
} from '@/shared/lib/catalogos'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '../lib/format'
import type { Ticket } from '../types'

export interface TicketDetailViewProps {
  ticket: Ticket
}

/** Uppercase, tracking, muted field label — matches CONSTITUTION §3 form label convention. */
function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  )
}

export function TicketDetailView({ ticket }: TicketDetailViewProps) {
  return (
    <div
      data-ticket-print
      className="space-y-6 rounded-lg border border-slate-200/50 bg-card p-6 backdrop-blur-sm transition-all duration-300 dark:border-white/5"
    >
      {/* Header: numero + titulo */}
      <div className="space-y-1">
        <FieldLabel>{ticket.numero}</FieldLabel>
        <h1 className="text-xl font-semibold text-foreground">{ticket.titulo}</h1>
      </div>

      {/* Badges: tipo / estado / prioridad — siempre labels de catálogo, nunca ids crudos */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{labelFor(TIPOS, ticket.tipoId)}</Badge>
        <Badge tone={ESTADO_TONE[ticket.estadoId] ?? 'neutral'}>
          {labelFor(ESTADOS, ticket.estadoId)}
        </Badge>
        <Badge tone={PRIORIDAD_TONE[ticket.prioridadId] ?? 'neutral'}>
          {labelFor(PRIORIDADES, ticket.prioridadId)}
        </Badge>
      </div>

      {/* Descripcion */}
      <div className="space-y-1">
        <FieldLabel>Descripción</FieldLabel>
        <p className="text-sm text-foreground">
          {ticket.descripcion ?? 'Sin descripción'}
        </p>
      </div>

      {/* Fechas — divisor hairline separa el bloque de metadatos temporales */}
      <div className="grid grid-cols-1 gap-4 border-t border-slate-200/50 pt-4 dark:border-white/5 sm:grid-cols-3">
        <div className="space-y-1">
          <FieldLabel>Creación</FieldLabel>
          <p className="text-sm text-foreground">{formatDate(ticket.createdAt)}</p>
        </div>
        <div className="space-y-1">
          <FieldLabel>Última actualización</FieldLabel>
          <p className="text-sm text-foreground">{formatDate(ticket.updatedAt)}</p>
        </div>
        {ticket.fechaCierre !== null && (
          <div className="space-y-1">
            <FieldLabel>Cierre</FieldLabel>
            <p className="text-sm text-foreground">{formatDate(ticket.fechaCierre)}</p>
          </div>
        )}
      </div>
    </div>
  )
}
