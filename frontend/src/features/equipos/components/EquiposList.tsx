/**
 * EquiposList — PRESENTATIONAL component (S5b: migrated from <table> to CardRow).
 *
 * Receives `equipos` as a prop; renders a list of CardRow items.
 * No API calls, no mutations, no routing — pure UI.
 *
 * Layout per card: icon (Monitor) | nombre + marca/modelo/serie/date | activo badge
 *
 * Badge logic:
 *   activo=true  → Badge tone "success" (bg-emerald-500/10)  → "Activo"
 *   activo=false → Badge tone "neutral" (bg-muted)           → "Inactivo"
 *
 * ACTIVO_BADGE constant removed — replaced by <Badge> component with semantic tones.
 *
 * Design: Container/Presentational per design.md §1.
 * Constitution: filas-tarjeta (§3) — glassmorphism rows, badges rounded-md, no tables.
 * Spec: [SPEC:frontend-design-system/req-8-filas-tarjeta]
 */

import { CardRow } from '@/components/ui/card-row'
import { Badge } from '@/components/ui/badge'
import { Monitor } from 'lucide-react'
import type { Equipo } from '../types'

interface EquiposListProps {
  equipos: Equipo[]
}

/** Format ISO date string in Argentinean locale (dd/mm/yyyy). Returns "—" for null. */
function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso))
}

export function EquiposList({ equipos }: EquiposListProps) {
  return (
    <div className="space-y-2">
      {equipos.map((equipo) => (
        <CardRow
          key={equipo.id}
          icon={<Monitor className="h-5 w-5 text-muted-foreground" aria-hidden />}
          title={equipo.nombre}
          subtitle={
            // Each part in its own span so getByText() exact-match continues to work
            // in integration tests (RTL requires isolated text nodes).
            <span>
              <span>{equipo.marca ?? '—'}</span>
              {' '}
              <span>{equipo.modelo ?? '—'}</span>
              {' · N° '}
              <span>{equipo.numeroSerie ?? '—'}</span>
              {' · '}
              <span>{formatDate(equipo.fechaAdquisicion)}</span>
            </span>
          }
          badges={
            <Badge tone={equipo.activo ? 'success' : 'neutral'}>
              {equipo.activo ? 'Activo' : 'Inactivo'}
            </Badge>
          }
        />
      ))}
    </div>
  )
}
