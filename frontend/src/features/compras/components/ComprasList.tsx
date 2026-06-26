/**
 * ComprasList — PRESENTATIONAL component (S5a: migrated from <table> to CardRow).
 *
 * Receives `compras` as a prop; renders a list of CardRow items.
 * No API calls, no mutations, no routing — pure UI.
 *
 * Layout per card: icon (ShoppingCart) | titulo + numero/date | estado badge + aprobación
 *
 * AprobacionCell logic (preserved from original):
 *   - motivoRechazo → "Rechazada (motivo)" — checked FIRST because a rejected
 *     compra can have BOTH motivoRechazo AND aprobadoEn (aprobadoEn = who processed it).
 *     Checking rejection first prevents mislabeling a rejection as "Aprobada".
 *   - aprobadoEn (no motivoRechazo) → "Aprobada {fecha}"
 *   - neither → "—"
 *
 * Design: Container/Presentational per design.md §1.
 * Constitution: filas-tarjeta (§3) — glassmorphism rows, badges rounded-md, no tables.
 * Spec: [SPEC:frontend-design-system/req-8-filas-tarjeta]
 */

import { CardRow } from '@/components/ui/card-row'
import { Badge } from '@/components/ui/badge'
import { labelFor, ESTADOS, ESTADO_TONE } from '@/shared/lib/catalogos'
import { ShoppingCart } from 'lucide-react'
import type { Compra } from '../types'

interface ComprasListProps {
  compras: Compra[]
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
 * Aprobación status cell.
 *
 * Rejection is checked FIRST — a rejected compra carries BOTH motivoRechazo
 * AND aprobadoEn (the date it was processed). Checking motivation first prevents
 * mislabeling a rejection as "Aprobada". This invariant is documented and tested.
 */
function AprobacionCell({ compra }: { compra: Compra }) {
  if (compra.motivoRechazo) {
    return (
      <span className="text-foreground text-xs">
        Rechazada{' '}
        <span
          className="text-muted-foreground"
          title={compra.motivoRechazo}
        >
          ({compra.motivoRechazo})
        </span>
      </span>
    )
  }
  if (compra.aprobadoEn) {
    return (
      <span className="text-foreground text-xs">
        Aprobada {formatDate(compra.aprobadoEn)}
      </span>
    )
  }
  return <span className="text-muted-foreground text-xs">—</span>
}

export function ComprasList({ compras }: ComprasListProps) {
  return (
    <div className="space-y-2">
      {compras.map((compra) => (
        <CardRow
          key={compra.id}
          icon={<ShoppingCart className="h-5 w-5 text-muted-foreground" aria-hidden />}
          title={compra.titulo}
          subtitle={
            // numero in its own span so integration tests can findByText("CMP-2026-00001")
            // with RTL's default exact-match (element textContent must equal the string).
            <span>
              <span>{compra.numero}</span>
              {' · '}
              <span>{formatDate(compra.createdAt)}</span>
            </span>
          }
          badges={
            <>
              <Badge tone={ESTADO_TONE[compra.estadoId] ?? 'neutral'}>
                {labelFor(ESTADOS, compra.estadoId)}
              </Badge>
              <AprobacionCell compra={compra} />
            </>
          }
        />
      ))}
    </div>
  )
}
