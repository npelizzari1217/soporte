/**
 * ReparacionesList — PRESENTATIONAL component (S5b: migrated from <table> to CardRow).
 *
 * Receives `reparaciones` as a prop; renders a list of CardRow items.
 * No API calls, no mutations, no routing — pure UI.
 *
 * Layout per card: icon (Wrench) | titulo + numero/ubicacion | estado badge + AvanceCell
 *
 * Design: Container/Presentational per design.md §1.
 * Constitution: filas-tarjeta (§3) — glassmorphism rows, badges rounded-md, no tables.
 * Colors: semantic badge tones via ESTADO_TONE from catalogos.ts.
 * Spec: [SPEC:frontend-design-system/req-8-filas-tarjeta]
 */

import { CardRow } from '@/components/ui/card-row'
import { Badge } from '@/components/ui/badge'
import { labelFor, ESTADOS, ESTADO_TONE } from '@/shared/lib/catalogos'
import { Wrench } from 'lucide-react'
import type { Reparacion } from '../types'

interface ReparacionesListProps {
  reparaciones: Reparacion[]
}

/** Format ISO date string in Argentinean locale (dd/mm/yyyy). */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso))
}

/**
 * Progress bar + percentage text for the avance field.
 * Preserved from original implementation — the bar is a visual affordance
 * and the text makes the value accessible (screen readers + print).
 */
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
  )
}

export function ReparacionesList({ reparaciones }: ReparacionesListProps) {
  return (
    <div className="space-y-2">
      {reparaciones.map((rep) => (
        <CardRow
          key={rep.id}
          icon={<Wrench className="h-5 w-5 text-muted-foreground" aria-hidden />}
          title={rep.titulo}
          subtitle={
            // Each part in its own span so getByText() exact-match continues to work
            // in integration tests (RTL requires isolated text nodes).
            <span>
              <span>{rep.numero}</span>
              {' · '}
              <span>{rep.ubicacionNombre ?? '—'}</span>
              {' · '}
              <span>{formatDate(rep.createdAt)}</span>
            </span>
          }
          badges={
            <>
              <Badge tone={ESTADO_TONE[rep.estadoId] ?? 'neutral'}>
                {labelFor(ESTADOS, rep.estadoId)}
              </Badge>
              <AvanceCell porcentaje={rep.porcentajeAvance} />
            </>
          }
        />
      ))}
    </div>
  )
}
