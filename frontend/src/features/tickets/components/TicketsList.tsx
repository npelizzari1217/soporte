/**
 * TicketsList — PRESENTATIONAL + delete-state component (S5a: migrated from <table> to CardRow).
 *
 * Receives `tickets` as a prop; renders a list of CardRow items.
 * No API calls for reads — pure UI for listing.
 *
 * S2/T2.3: adds header with "Nuevo ticket" button gated by ticket:crear permission.
 * S3/T3.3: adds per-row "Editar" button gated by ticket:editar permission.
 * S4/T4.2: adds per-row "Borrar" button gated by ticket:eliminar permission.
 *          Owns local confirmId state + ConfirmDialog + useDeleteTicket mutation.
 *          On confirm: calls useDeleteTicket → notify.success → setConfirmId(null).
 *          On error: notify.error (confirmId stays set → dialog remains open for retry).
 *
 * Design: Container/Presentational per design.md §1; ADR-2 ConfirmDialog destructivo.
 * Constitution: filas-tarjeta (§3) — glassmorphism rows, badges rounded-md, no tables.
 * Spec: tickets-ui §req Acción "Crear ticket" solo visible para ticket:crear
 * Spec: tickets-ui §req Acción "Editar" solo visible para ticket:editar
 * Spec: tickets-ui §req Acción "Eliminar" solo visible para ticket:eliminar
 */

"use client";

import { useState } from 'react'
import { CardRow } from '@/components/ui/card-row'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  labelFor,
  ESTADOS,
  PRIORIDADES,
  TIPOS,
  ESTADO_TONE,
  PRIORIDAD_TONE,
} from '@/shared/lib/catalogos'
import { notify } from '@/shared/lib/notify'
import { mapApiError } from '@/shared/lib/map-api-error'
import { Ticket as TicketIcon, Pencil, Trash2 } from 'lucide-react'
import { useSession } from '@/shared/hooks/use-session'
import { useDeleteTicket } from '../hooks/use-delete-ticket'
import type { Ticket } from '../types'

interface TicketsListProps {
  tickets: Ticket[]
  /** Called when user clicks "Nuevo ticket". Only rendered when user has ticket:crear. */
  onOpenCreate?: () => void
  /** Called when user clicks the edit button for a ticket. Only rendered when user has ticket:editar. */
  onOpenEdit?: (ticket: Ticket) => void
}

/** Format ISO date string in Argentinean locale (dd/mm/yyyy). */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso))
}

export function TicketsList({ tickets, onOpenCreate, onOpenEdit }: TicketsListProps) {
  const { can } = useSession()

  /**
   * S4/T4.2 — delete confirmation state.
   * confirmId holds the id of the ticket pending deletion.
   * null = no dialog open.
   */
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const deleteTicket = useDeleteTicket()

  const confirmTicket = tickets.find((t) => t.id === confirmId)

  /** Executes the delete mutation. On success: toast + close dialog. On error: toast, dialog stays open. */
  async function handleDelete() {
    if (!confirmId) return
    try {
      await deleteTicket.mutateAsync(confirmId)
      notify.success('Ticket eliminado')
      setConfirmId(null)
    } catch (err) {
      notify.error(mapApiError(err))
      // confirmId NOT cleared → dialog stays open (user can retry or cancel)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header: only show "Nuevo ticket" button if user has the permission */}
      {can('ticket:crear') && (
        <div className="flex justify-end">
          <Button onClick={onOpenCreate}>Nuevo ticket</Button>
        </div>
      )}
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
              {can('ticket:editar') && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => { e.stopPropagation(); onOpenEdit?.(ticket) }}
                  aria-label="Editar ticket"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              {can('ticket:eliminar') && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => { e.stopPropagation(); setConfirmId(ticket.id) }}
                  aria-label="Borrar ticket"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </>
          }
        />
      ))}
      </div>

      {/*
       * S4/T4.2 — ConfirmDialog for destructive delete.
       * ADR-2: AlertDialog fuerza decisión explícita (no cierra por ESC ni click-outside).
       * El caller (handleDelete) controla confirmId → open state.
       * isPending bloquea el botón de confirmar mientras el DELETE está en vuelo.
       */}
      <ConfirmDialog
        open={!!confirmId}
        onOpenChange={(v) => { if (!v) setConfirmId(null) }}
        title="¿Eliminar ticket?"
        description={
          confirmTicket
            ? `¿Eliminás "${confirmTicket.titulo}"? Esta acción no se puede deshacer.`
            : undefined
        }
        onConfirm={handleDelete}
        isPending={deleteTicket.isPending}
      />
    </div>
  )
}
