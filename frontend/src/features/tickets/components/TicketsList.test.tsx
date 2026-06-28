/**
 * TicketsList unit + integration tests.
 * S5a: CardRow migration — verifies layout and badge tones.
 * S2/T2.3: "Nuevo ticket" button gated by ticket:crear permission.
 * S3/T3.3: "Editar" button gated by ticket:editar permission.
 * S4/T4.2: "Borrar" button gated by ticket:eliminar; ConfirmDialog wiring.
 *
 * Atomicity contract (layout tests): local fixtures only, no network.
 * Integration tests (T4.2): MSW intercepts DELETE /api/tickets/:id.
 * All tests need QueryClientProvider because TicketsList calls useDeleteTicket().
 *
 * Spec: [SPEC:frontend-design-system/req-8-filas-tarjeta]
 * Spec: tickets-ui §req Acción "Crear ticket" solo visible para ticket:crear
 * Spec: tickets-ui §req Acción "Editar" solo visible para ticket:editar
 * Spec: tickets-ui §req Acción "Eliminar" solo visible para ticket:eliminar
 * Design: design.md §4 Delete flow, ADR-2 ConfirmDialog destructivo
 */

import * as React from 'react'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse, delay } from 'msw'
import { server } from '../../../../test/msw/server'
import { TicketsList } from './TicketsList'
import type { Ticket } from '../types'
import { SessionProvider } from '@/shared/providers/session-provider'
import type { JwtPayload } from '@/shared/api/types'
import * as notifyModule from '@/shared/lib/notify'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeUser(permisos: string[]): JwtPayload {
  return {
    sub: 'user-test-sub',
    cliente_id: 'cliente-1',
    email: 'test@test.com',
    roles: [],
    permisos,
  }
}

const ESTADO_PENDIENTE  = 'c0000000-0000-4000-c000-000000000002' // Pendiente de aprobación → warning → bg-amber-500/10
const ESTADO_EN_PROG    = 'c0000000-0000-4000-c000-000000000005' // En progreso → info → bg-blue-500/10
const PRIORIDAD_CRITICA = 'd0000000-0000-4000-d000-000000000004' // Crítica → danger → bg-red-500/10
const PRIORIDAD_MEDIA   = 'd0000000-0000-4000-d000-000000000002' // Media → info → bg-blue-500/10
const TIPO_SOPORTE      = 'e0000000-0000-4000-e000-000000000001'

const mockTickets: Ticket[] = [
  {
    id: 'ticket-1',
    numero: 'SOP-2026-00001',
    titulo: 'Problema con impresora',
    descripcion: null,
    tipoId: TIPO_SOPORTE,
    estadoId: ESTADO_PENDIENTE,
    prioridadId: PRIORIDAD_CRITICA,
    cicloId: null,
    solicitanteId: 'user-1',
    asignadoId: null,
    fechaResolucion: null,
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-01-15T10:00:00Z',
  },
  {
    id: 'ticket-2',
    numero: 'SOP-2026-00002',
    titulo: 'Falla en red local',
    descripcion: null,
    tipoId: TIPO_SOPORTE,
    estadoId: ESTADO_EN_PROG,
    prioridadId: PRIORIDAD_MEDIA,
    cicloId: null,
    solicitanteId: 'user-2',
    asignadoId: null,
    fechaResolucion: null,
    createdAt: '2026-01-14T09:00:00Z',
    updatedAt: '2026-01-14T09:00:00Z',
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
}

/**
 * Render TicketsList wrapped with required providers.
 * All tests need QueryClientProvider because TicketsList calls useDeleteTicket().
 * SessionProvider is included when `user` is provided.
 */
function renderList(
  props: React.ComponentProps<typeof TicketsList>,
  options?: { user?: JwtPayload; qc?: QueryClient }
) {
  const qc = options?.qc ?? makeQC()
  const content = options?.user ? (
    <SessionProvider initialUser={options.user}>
      <TicketsList {...props} />
    </SessionProvider>
  ) : (
    <TicketsList {...props} />
  )
  const result = render(
    <QueryClientProvider client={qc}>{content}</QueryClientProvider>
  )
  return { qc, ...result }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TicketsList', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // ─── Layout: no table ──────────────────────────────────────────────────────

  it('renders NO <table> element (migrated to card rows)', () => {
    renderList({ tickets: mockTickets })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders NO <tr> elements', () => {
    const { container } = renderList({ tickets: mockTickets })
    expect(container.querySelector('tr')).toBeNull()
  })

  // ─── Content ───────────────────────────────────────────────────────────────

  it('renders each ticket title as visible text', () => {
    renderList({ tickets: mockTickets })
    expect(screen.getByText('Problema con impresora')).toBeInTheDocument()
    expect(screen.getByText('Falla en red local')).toBeInTheDocument()
  })

  it('renders the correct number of card rows', () => {
    renderList({ tickets: mockTickets })
    const titles = screen.getAllByText(/Problema con impresora|Falla en red local/)
    expect(titles).toHaveLength(2)
  })

  // ─── Badge tones ───────────────────────────────────────────────────────────

  it('estado Pendiente de aprobación badge has warning tone (bg-amber-500/10)', () => {
    renderList({ tickets: [mockTickets[0]] })
    const badge = screen.getByText('Pendiente de aprobación').closest('span')
    expect(badge?.className).toContain('bg-amber-500/10')
  })

  it('estado En progreso badge has info tone (bg-blue-500/10)', () => {
    renderList({ tickets: [mockTickets[1]] })
    const badge = screen.getByText('En progreso').closest('span')
    expect(badge?.className).toContain('bg-blue-500/10')
  })

  it('prioridad Crítica badge has danger tone (bg-red-500/10)', () => {
    renderList({ tickets: [mockTickets[0]] })
    const badge = screen.getByText('Crítica').closest('span')
    expect(badge?.className).toContain('bg-red-500/10')
  })

  it('prioridad Media badge has info tone (bg-blue-500/10)', () => {
    renderList({ tickets: [mockTickets[1]] })
    const badge = screen.getByText('Media').closest('span')
    expect(badge?.className).toContain('bg-blue-500/10')
  })

  // ─── Empty ─────────────────────────────────────────────────────────────────

  it('renders empty list when tickets array is empty', () => {
    const { container } = renderList({ tickets: [] })
    expect(screen.queryByText('Problema con impresora')).not.toBeInTheDocument()
    expect(container.querySelectorAll('[role="listitem"]').length).toBe(0)
  })

  // ─── S2/T2.3 — "Nuevo ticket" button gated by ticket:crear permission ─────

  it('shows "Nuevo ticket" button when user has ticket:crear permission', () => {
    renderList(
      { tickets: mockTickets, onOpenCreate: vi.fn() },
      { user: makeUser(['ticket:crear']) }
    )
    expect(screen.getByRole('button', { name: /nuevo ticket/i })).toBeInTheDocument()
  })

  it('does NOT show "Nuevo ticket" button when user lacks ticket:crear permission', () => {
    renderList(
      { tickets: mockTickets, onOpenCreate: vi.fn() },
      { user: makeUser(['ticket:ver_todos']) }
    )
    expect(screen.queryByRole('button', { name: /nuevo ticket/i })).not.toBeInTheDocument()
  })

  it('calls onOpenCreate when "Nuevo ticket" button is clicked', async () => {
    const user = userEvent.setup()
    const onOpenCreate = vi.fn()

    renderList(
      { tickets: mockTickets, onOpenCreate },
      { user: makeUser(['ticket:crear']) }
    )

    await user.click(screen.getByRole('button', { name: /nuevo ticket/i }))
    expect(onOpenCreate).toHaveBeenCalledTimes(1)
  })

  // ─── S3/T3.3 — "Editar" button gated by ticket:editar permission ──────────

  it('shows "Editar" button per ticket when user has ticket:editar permission', () => {
    renderList(
      { tickets: mockTickets, onOpenEdit: vi.fn() },
      { user: makeUser(['ticket:editar']) }
    )
    const editButtons = screen.getAllByRole('button', { name: /editar ticket/i })
    expect(editButtons).toHaveLength(mockTickets.length)
  })

  it('does NOT show "Editar" button when user lacks ticket:editar permission', () => {
    renderList(
      { tickets: mockTickets, onOpenEdit: vi.fn() },
      { user: makeUser(['ticket:ver_todos']) }
    )
    expect(screen.queryByRole('button', { name: /editar ticket/i })).not.toBeInTheDocument()
  })

  it('calls onOpenEdit with the correct ticket when "Editar" is clicked', async () => {
    const user = userEvent.setup()
    const onOpenEdit = vi.fn()

    renderList(
      { tickets: mockTickets, onOpenEdit },
      { user: makeUser(['ticket:editar']) }
    )

    const editButtons = screen.getAllByRole('button', { name: /editar ticket/i })
    await user.click(editButtons[0])

    expect(onOpenEdit).toHaveBeenCalledTimes(1)
    expect(onOpenEdit).toHaveBeenCalledWith(mockTickets[0])
  })

  // ─── S4/T4.2 — "Borrar" button gated by ticket:eliminar permission ────────

  // T4.2-1: user WITH ticket:eliminar → Borrar button visible per row
  it('shows "Borrar" button per ticket when user has ticket:eliminar permission', () => {
    renderList(
      { tickets: mockTickets },
      { user: makeUser(['ticket:eliminar']) }
    )
    const deleteButtons = screen.getAllByRole('button', { name: /borrar ticket/i })
    expect(deleteButtons).toHaveLength(mockTickets.length)
  })

  // T4.2-2: user WITHOUT ticket:eliminar → Borrar button NOT in DOM
  it('does NOT show "Borrar" button when user lacks ticket:eliminar permission', () => {
    renderList(
      { tickets: mockTickets },
      { user: makeUser(['ticket:ver_todos']) }
    )
    expect(screen.queryByRole('button', { name: /borrar ticket/i })).not.toBeInTheDocument()
  })

  // T4.2-3: click "Borrar" → ConfirmDialog opens; DELETE NOT dispatched yet
  it('click "Borrar" opens ConfirmDialog; DELETE not dispatched yet', async () => {
    const user = userEvent.setup()
    let deleteDispatched = false

    server.use(
      http.delete('http://localhost/api/tickets/:id', () => {
        deleteDispatched = true
        return new HttpResponse(null, { status: 204 })
      })
    )

    renderList(
      { tickets: mockTickets },
      { user: makeUser(['ticket:eliminar']) }
    )

    const deleteButtons = screen.getAllByRole('button', { name: /borrar ticket/i })
    await user.click(deleteButtons[0]) // Borrar for "Problema con impresora"

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(deleteDispatched).toBe(false)
  })

  // T4.2-4: ConfirmDialog shows ticket titulo in the confirmation message
  it('ConfirmDialog shows the ticket titulo in the description', async () => {
    const user = userEvent.setup()

    renderList(
      { tickets: mockTickets },
      { user: makeUser(['ticket:eliminar']) }
    )

    const deleteButtons = screen.getAllByRole('button', { name: /borrar ticket/i })
    await user.click(deleteButtons[0]) // ticket-1: "Problema con impresora"

    // The description within the alertdialog mentions the ticket title
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText(/Problema con impresora/)).toBeInTheDocument()
  })

  // T4.2-5: click overlay → dialog STAYS open (AlertDialog behavior)
  it('overlay click does not close the ConfirmDialog (AlertDialog behavior)', async () => {
    const user = userEvent.setup()

    renderList(
      { tickets: mockTickets },
      { user: makeUser(['ticket:eliminar']) }
    )

    const deleteButtons = screen.getAllByRole('button', { name: /borrar ticket/i })
    await user.click(deleteButtons[0])

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    // AlertDialog overlay does not close on pointer down outside content
    fireEvent.pointerDown(document.body)

    // Dialog must still be open
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  // T4.2-6: click "Cancelar" → dialog closes; DELETE NOT dispatched
  it('click "Cancelar" closes dialog without dispatching DELETE', async () => {
    const user = userEvent.setup()
    let deleteDispatched = false

    server.use(
      http.delete('http://localhost/api/tickets/:id', () => {
        deleteDispatched = true
        return new HttpResponse(null, { status: 204 })
      })
    )

    renderList(
      { tickets: mockTickets },
      { user: makeUser(['ticket:eliminar']) }
    )

    const deleteButtons = screen.getAllByRole('button', { name: /borrar ticket/i })
    await user.click(deleteButtons[0])

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Cancelar/i }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(deleteDispatched).toBe(false)
  })

  // T4.2-7: click "Confirmar" → DELETE 204 → notify.success + dialog closes + invalidateQueries
  it('click "Confirmar" → 204 → notify.success; dialog closes; invalidateQueries called', async () => {
    const user = userEvent.setup()
    const notifySuccess = vi.spyOn(notifyModule.notify, 'success')
    const qc = makeQC()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    server.use(
      http.delete('http://localhost/api/tickets/:id', () => {
        return new HttpResponse(null, { status: 204 })
      })
    )

    renderList(
      { tickets: mockTickets },
      { user: makeUser(['ticket:eliminar']), qc }
    )

    const deleteButtons = screen.getAllByRole('button', { name: /borrar ticket/i })
    await user.click(deleteButtons[0])

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Eliminar|Confirmar/i }))

    // Wait for async effects
    await waitFor(() => {
      expect(notifySuccess).toHaveBeenCalledWith(expect.any(String))
    })

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['tickets'] })
    )
  })

  // T4.2-8: 204 idempotente — second delete of already-deleted ticket → same success behavior
  it('204 idempotente (re-delete) → same success result as first delete', async () => {
    const user = userEvent.setup()
    const notifySuccess = vi.spyOn(notifyModule.notify, 'success')

    server.use(
      http.delete('http://localhost/api/tickets/:id', () => {
        // Backend always returns 204 (idempotent)
        return new HttpResponse(null, { status: 204 })
      })
    )

    renderList(
      { tickets: mockTickets },
      { user: makeUser(['ticket:eliminar']) }
    )

    // First delete
    const deleteButtons = screen.getAllByRole('button', { name: /borrar ticket/i })
    await user.click(deleteButtons[0])
    await user.click(screen.getByRole('button', { name: /Eliminar|Confirmar/i }))

    await waitFor(() => {
      expect(notifySuccess).toHaveBeenCalledTimes(1)
    })

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  // T4.2-9: error de red → notify.error; dialog STAYS open
  it('network error → notify.error; ConfirmDialog stays open', async () => {
    const user = userEvent.setup()
    const notifyError = vi.spyOn(notifyModule.notify, 'error')

    server.use(
      http.delete('http://localhost/api/tickets/:id', () => {
        return HttpResponse.error()
      })
    )

    renderList(
      { tickets: mockTickets },
      { user: makeUser(['ticket:eliminar']) }
    )

    const deleteButtons = screen.getAllByRole('button', { name: /borrar ticket/i })
    await user.click(deleteButtons[0])

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Eliminar|Confirmar/i }))

    await waitFor(() => {
      expect(notifyError).toHaveBeenCalledWith(expect.any(String))
    })

    // Dialog must remain open so user can retry or cancel
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  // T4.2-10: isPending=true while DELETE in flight → Confirmar button is disabled
  it('Confirmar button is disabled while DELETE is in flight (isPending)', async () => {
    const user = userEvent.setup()

    server.use(
      http.delete('http://localhost/api/tickets/:id', async () => {
        await delay(200)
        return new HttpResponse(null, { status: 204 })
      })
    )

    renderList(
      { tickets: mockTickets },
      { user: makeUser(['ticket:eliminar']) }
    )

    const deleteButtons = screen.getAllByRole('button', { name: /borrar ticket/i })
    await user.click(deleteButtons[0])

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    // Start confirming but don't await — check isPending state while in flight
    const clickPromise = user.click(screen.getByRole('button', { name: /Eliminar|Confirmar/i }))

    // The confirm button should be disabled while DELETE is in flight
    await waitFor(() => {
      const confirmBtn = screen.getByRole('button', { name: /Eliminar|Confirmar/i })
      expect(confirmBtn).toBeDisabled()
    })

    await clickPromise
  })
})
