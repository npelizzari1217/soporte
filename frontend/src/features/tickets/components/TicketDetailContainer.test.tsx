/**
 * TicketDetailContainer unit tests (PR3 — ticket-detail-page, Phase 4).
 *
 * TDD RED — written before implementation.
 * MSW intercepts GET/PATCH/DELETE /api/tickets/:id — no real network.
 * next/navigation mocked (useRouter) per repo convention (LoginForm.test.tsx).
 *
 * Covers the 4 mutually-exclusive states (loading/error/notFound/success),
 * permission gating (ticket:editar / ticket:eliminar), the delete flow
 * (confirm → success/error), edit flow (modal prefilled → save → invalidation),
 * and the always-visible Imprimir action.
 *
 * Spec: [SPEC:ticket-detail/fetch-de-ticket-por-id-con-estados-explicitos]
 * Spec: [SPEC:ticket-detail/accion-modificar-gateada-por-permiso]
 * Spec: [SPEC:ticket-detail/accion-eliminar-gateada-por-permiso-con-confirmacion]
 * Spec: [SPEC:ticket-detail/accion-imprimir-siempre-visible]
 * Design: ADR-2 (estados derivados de useTicket), ADR-3 (reuso TicketFormModal/useDeleteTicket)
 */

import * as React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../test/msw/server'
import { TicketDetailContainer } from './TicketDetailContainer'
import { SessionProvider } from '@/shared/providers/session-provider'
import type { JwtPayload } from '@/shared/api/types'
import type { Ticket } from '../types'
import * as notifyModule from '@/shared/lib/notify'

// ─── Router mock (repo convention — LoginForm.test.tsx) ───────────────────────

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

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

const TICKET_ID = 'ticket-uuid-001'

const mockTicket: Ticket = {
  id: TICKET_ID,
  numero: 'SOP-2026-00001',
  titulo: 'Impresora no enciende',
  descripcion: 'No prende desde ayer',
  tipoId: 'e0000000-0000-4000-e000-000000000001',
  estadoId: 'c0000000-0000-4000-c000-000000000002',
  prioridadId: 'd0000000-0000-4000-d000-000000000002',
  cicloId: null,
  solicitanteId: 'user-1',
  asignadoId: null,
  fechaCierre: null,
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-15T10:00:00Z',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function renderContainer(user: JwtPayload, qc: QueryClient = makeQC()) {
  return render(
    <QueryClientProvider client={qc}>
      <SessionProvider initialUser={user}>
        <TicketDetailContainer id={TICKET_ID} />
      </SessionProvider>
    </QueryClientProvider>
  )
}

function getTicketUrl() {
  return `http://localhost/api/tickets/${TICKET_ID}`
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TicketDetailContainer', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockPush.mockClear()
  })

  // 4.1 — loading → skeleton
  it('shows a skeleton while loading, before data resolves', () => {
    server.use(
      http.get(getTicketUrl(), async () => {
        await new Promise((r) => setTimeout(r, 50))
        return HttpResponse.json(mockTicket)
      })
    )
    const { container } = renderContainer(makeUser([]))
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  // 4.2 — notFound → EmptyState + link a /tickets
  it('shows "Ticket no encontrado" empty state on 404 and navigates to /tickets on click', async () => {
    server.use(
      http.get(getTicketUrl(), () =>
        HttpResponse.json({ statusCode: 404, message: 'not found' }, { status: 404 })
      )
    )
    renderContainer(makeUser([]))

    await waitFor(() =>
      expect(screen.getByText('Ticket no encontrado')).toBeInTheDocument()
    )

    await userEvent.click(screen.getByRole('button', { name: /volver a tickets/i }))
    expect(mockPush).toHaveBeenCalledWith('/tickets')
  })

  // 4.3 — error genérico → mensaje + Reintentar dispara refetch
  it(
    'shows error message + Reintentar on 500; Reintentar refetches and succeeds',
    async () => {
      let calls = 0
      server.use(
        http.get(getTicketUrl(), () => {
          calls++
          if (calls <= 3) {
            return HttpResponse.json({ statusCode: 500, message: 'boom' }, { status: 500 })
          }
          return HttpResponse.json(mockTicket)
        })
      )

      renderContainer(makeUser([]))

      // ADR-2 retries 5xx up to 2 times (3 calls total) before isError → extend timeout,
      // mirrors use-ticket.test.ts's 500 scenario.
      await waitFor(
        () => expect(screen.getByText('No se pudo cargar el ticket.')).toBeInTheDocument(),
        { timeout: 10000 }
      )

      await userEvent.click(screen.getByRole('button', { name: /reintentar/i }))

      await waitFor(() =>
        expect(screen.getByText('Impresora no enciende')).toBeInTheDocument()
      )
    },
    15000
  )

  // 4.4 — success → TicketDetailView + toolbar fuera del print root
  it('success renders TicketDetailView and places the toolbar OUTSIDE the print root', async () => {
    server.use(http.get(getTicketUrl(), () => HttpResponse.json(mockTicket)))

    const { container } = renderContainer(
      makeUser(['ticket:editar', 'ticket:eliminar'])
    )

    await waitFor(() =>
      expect(screen.getByText('Impresora no enciende')).toBeInTheDocument()
    )

    const printRoot = container.querySelector('[data-ticket-print]')
    expect(printRoot).not.toBeNull()

    const imprimirBtn = screen.getByRole('button', { name: /imprimir/i })
    expect(printRoot?.contains(imprimirBtn)).toBe(false)
  })

  // 4.5 — sin ticket:editar → botón Modificar ausente
  it('does NOT show "Modificar" without ticket:editar', async () => {
    server.use(http.get(getTicketUrl(), () => HttpResponse.json(mockTicket)))
    renderContainer(makeUser([]))

    await waitFor(() =>
      expect(screen.getByText('Impresora no enciende')).toBeInTheDocument()
    )
    expect(screen.queryByRole('button', { name: /modificar/i })).not.toBeInTheDocument()
  })

  // 4.6 — con permiso → abre TicketFormModal mode="edit" prellenado; guardar invalida el detail
  it(
    'opens TicketFormModal prefilled on "Modificar"; saving invalidates tickets.detail(id)',
    async () => {
      const user = userEvent.setup()
      server.use(
        http.get(getTicketUrl(), () => HttpResponse.json(mockTicket)),
        http.patch(getTicketUrl(), async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          return HttpResponse.json({ ...mockTicket, ...body })
        })
      )
      const qc = makeQC()
      const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

      renderContainer(makeUser(['ticket:editar']), qc)

      await waitFor(() =>
        expect(screen.getByText('Impresora no enciende')).toBeInTheDocument()
      )

      await user.click(screen.getByRole('button', { name: /modificar/i }))

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByLabelText('Título')).toHaveValue(mockTicket.titulo)

      await user.clear(within(dialog).getByLabelText('Título'))
      await user.type(within(dialog).getByLabelText('Título'), 'Titulo editado')
      await user.click(within(dialog).getByRole('button', { name: /guardar/i }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['tickets', TICKET_ID] })
      )
    }
  )

  // 4.7 — sin ticket:eliminar → botón Eliminar ausente
  it('does NOT show "Eliminar" without ticket:eliminar', async () => {
    server.use(http.get(getTicketUrl(), () => HttpResponse.json(mockTicket)))
    renderContainer(makeUser([]))

    await waitFor(() =>
      expect(screen.getByText('Impresora no enciende')).toBeInTheDocument()
    )
    expect(screen.queryByRole('button', { name: /^eliminar$/i })).not.toBeInTheDocument()
  })

  // 4.8 — confirmar + éxito → toast éxito + redirect /tickets
  it('confirm delete on success → toast success + redirect to /tickets', async () => {
    const user = userEvent.setup()
    const notifySuccess = vi.spyOn(notifyModule.notify, 'success')
    server.use(
      http.get(getTicketUrl(), () => HttpResponse.json(mockTicket)),
      http.delete(getTicketUrl(), () => new HttpResponse(null, { status: 204 }))
    )

    renderContainer(makeUser(['ticket:eliminar']))

    await waitFor(() =>
      expect(screen.getByText('Impresora no enciende')).toBeInTheDocument()
    )

    await user.click(screen.getByRole('button', { name: /^eliminar$/i }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /eliminar|confirmar/i })
    )

    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith(expect.any(String)))
    expect(mockPush).toHaveBeenCalledWith('/tickets')
  })

  // 4.9 — confirmar + error en la mutación → toast error, dialog sigue abierto
  it('confirm delete on mutation error → toast error; ConfirmDialog stays open', async () => {
    const user = userEvent.setup()
    const notifyError = vi.spyOn(notifyModule.notify, 'error')
    server.use(
      http.get(getTicketUrl(), () => HttpResponse.json(mockTicket)),
      http.delete(getTicketUrl(), () => HttpResponse.error())
    )

    renderContainer(makeUser(['ticket:eliminar']))

    await waitFor(() =>
      expect(screen.getByText('Impresora no enciende')).toBeInTheDocument()
    )

    await user.click(screen.getByRole('button', { name: /^eliminar$/i }))
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /eliminar|confirmar/i })
    )

    await waitFor(() => expect(notifyError).toHaveBeenCalledWith(expect.any(String)))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
  })

  // 4.10 — Imprimir siempre visible, click → window.print()
  it('"Imprimir" is always visible (no permission gate) and calls window.print() on click', async () => {
    const user = userEvent.setup()
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    server.use(http.get(getTicketUrl(), () => HttpResponse.json(mockTicket)))

    renderContainer(makeUser([]))

    await waitFor(() =>
      expect(screen.getByText('Impresora no enciende')).toBeInTheDocument()
    )

    await user.click(screen.getByRole('button', { name: /imprimir/i }))
    expect(printSpy).toHaveBeenCalledTimes(1)
  })
})
