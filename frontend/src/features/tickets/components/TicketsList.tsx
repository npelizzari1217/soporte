/**
 * TicketsList — PRESENTATIONAL component (S5a: migrated from <table> to CardRow).
 *
 * Receives `tickets` as a prop; renders a list of CardRow items.
 * No API calls, no mutations, no routing — pure UI.
 *
 * Layout per card: icon (Ticket) | titulo + numero/tipo/date | prioridad badge + estado badge
 *
 * Design: Container/Presentational per design.md §1.
 * Constitution: filas-tarjeta (§3) — glassmorphism rows, badges rounded-md, no tables.
 * Colors: semantic badge tones via ESTADO_TONE / PRIORIDAD_TONE from catalogos.ts.
 * Spec: [SPEC:frontend-design-system/req-8-filas-tarjeta]
 */

import { CardRow } from '@/components/ui/card-row'
import { Badge } from '@/components/ui/badge'
import {
  labelFor,
  ESTADOS,
  PRIORIDADES,
  TIPOS,
  ESTADO_TONE,
  PRIORIDAD_TONE,
} from '@/shared/lib/catalogos'
import { Ticket as TicketIcon } from 'lucide-react'
import type { Ticket } from '../types'

interface TicketsListProps {
  tickets: Ticket[]
}

/** Format ISO date string in Argentinean locale (dd/mm/yyyy). */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso))
}

export function TicketsList({ tickets }: TicketsListProps) {
  return (
    <div className="space-y-2">
      {tickets.map((ticket) => (
        <CardRow
          key={ticket.id}
          icon={<TicketIcon className="h-5 w-5 text-muted-foreground" aria-hidden />}
          title={ticket.titulo}
          subtitle={
            // Each part in its own span so findByText("SOP-2026-00001") / getByText("Soporte")
            // continue to work in integration tests (RTL exact-match requires isolated text nodes).
            <span>
              <span>{ticket.numero}</span>
              {' · '}
              <span>{labelFor(TIPOS, ticket.tipoId)}</span>
              {' · '}
              <span>{formatDate(ticket.createdAt)}</span>
            </span>
          }
          badges={
            <>
              <Badge tone={PRIORIDAD_TONE[ticket.prioridadId] ?? 'neutral'}>
                {labelFor(PRIORIDADES, ticket.prioridadId)}
              </Badge>
              <Badge tone={ESTADO_TONE[ticket.estadoId] ?? 'neutral'}>
                {labelFor(ESTADOS, ticket.estadoId)}
              </Badge>
            </>
          }
        />
      ))}
    </div>
  )
}
