/**
 * Tests for TicketFormModal (create + edit modes) + useTicketForm.
 * Slice 2 — S2/T2.4 (create mode), Slice 3 — S3/T3.4 (edit mode).
 *
 * TDD: RED tests written before implementation.
 * MSW intercepts POST /api/tickets (create) and PATCH /api/tickets/:id (edit).
 * notify is spied (not asserting sonner portal DOM).
 * SessionProvider provides user fixture (sub = 'user-test-sub').
 *
 * Spec: tickets-ui §req Formulario de creación; §req Formulario de edición
 * Spec: ui-states-delta §req 422 inline; §req 404 cierra; §req onSuccess
 * Design: design.md §4 (Create/Edit flows), §2 (Controller for Select), ADR-1 (form-level errors)
 */

import * as React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse, delay } from 'msw'
import { server } from '../../../../test/msw/server'
import { SessionProvider } from '@/shared/providers/session-provider'
import * as notify from '@/shared/lib/notify'
import { TicketFormModal } from './TicketFormModal'
import type { JwtPayload } from '@/shared/api/types'
import type { Ticket } from '../types'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const userFixture: JwtPayload = {
  sub: 'user-test-sub',
  cliente_id: 'cliente-1',
  email: 'test@example.com',
  roles: ['operador'],
  permisos: ['ticket:crear', 'ticket:editar'],
}

const ticketFixture: Ticket = {
  id: 'ticket-created-1',
  numero: 'SOP-2026-00099',
  titulo: 'Mi ticket de prueba',
  descripcion: null,
  tipoId: 'e0000000-0000-4000-e000-000000000001',
  estadoId: 'c0000000-0000-4000-c000-000000000001',
  prioridadId: 'd0000000-0000-4000-d000-000000000001',
  cicloId: null,
  solicitanteId: 'user-test-sub',
  asignadoId: null,
  fechaResolucion: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

// Fixture for edit mode — has pre-existing data
const editTicketFixture: Ticket = {
  id: 'ticket-edit-001',
  numero: 'SOP-2026-00001',
  titulo: 'Título existente',
  descripcion: 'Descripción existente',
  tipoId: 'e0000000-0000-4000-e000-000000000001', // Soporte (immutable — NOT editable)
  estadoId: 'c0000000-0000-4000-c000-000000000001', // Abierto (NOT editable)
  prioridadId: 'd0000000-0000-4000-d000-000000000002', // Media
  cicloId: null,
  solicitanteId: 'user-test-sub',
  asignadoId: null,
  fechaResolucion: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <SessionProvider initialUser={userFixture}>
          {children}
        </SessionProvider>
      </QueryClientProvider>
    )
  }
}

function renderModal(
  props: {
    open?: boolean
    onOpenChange?: (v: boolean) => void
    mode?: 'create' | 'edit'
    ticket?: Ticket
  } = {},
  qc?: QueryClient
) {
  const client = qc ?? new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  const onOpenChange = props.onOpenChange ?? vi.fn()
  const mode = props.mode ?? 'create'

  render(
    <QueryClientProvider client={client}>
      <SessionProvider initialUser={userFixture}>
        <TicketFormModal
          mode={mode}
          open={props.open ?? true}
          onOpenChange={onOpenChange}
          ticket={props.ticket}
        />
      </SessionProvider>
    </QueryClientProvider>
  )

  return { client, onOpenChange }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TicketFormModal (create)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // T2.4-1
  it('does NOT render role="dialog" when open=false', () => {
    renderModal({ open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // T2.4-2
  it('renders modal with required fields when open=true in create mode', () => {
    renderModal({ open: true })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // titulo field
    expect(screen.getByRole('textbox', { name: /título/i })).toBeInTheDocument()
    // descripcion field (textarea)
    expect(screen.getByRole('textbox', { name: /descripción/i })).toBeInTheDocument()
  })

  // T2.4-3: Select tipoId has options from TIPOS
  it('renders tipo Select with at least one option', async () => {
    const user = userEvent.setup()
    renderModal({ open: true })

    // Open the tipo select trigger
    const tipoTrigger = screen.getByRole('combobox', { name: /tipo/i })
    await user.click(tipoTrigger)

    // Options rendered in portal (document.body)
    const listbox = within(document.body).getByRole('listbox')
    expect(within(listbox).getByText('Soporte')).toBeInTheDocument()
  })

  // T2.4-4: Select prioridadId has options from PRIORIDADES
  it('renders prioridad Select with at least one option', async () => {
    const user = userEvent.setup()
    renderModal({ open: true })

    const prioridadTrigger = screen.getByRole('combobox', { name: /prioridad/i })
    await user.click(prioridadTrigger)

    const listbox = within(document.body).getByRole('listbox')
    expect(within(listbox).getByText('Baja')).toBeInTheDocument()
  })

  // T2.4-5: NO solicitanteId field in the form DOM
  it('does NOT have a solicitanteId input in the DOM', () => {
    renderModal({ open: true })
    // No input with name="solicitanteId"
    expect(document.querySelector('[name="solicitanteId"]')).toBeNull()
  })

  // T2.4-6: Submit with all empty → validation errors; POST NOT dispatched
  it('shows inline errors on submit with empty fields; does NOT call POST', async () => {
    const user = userEvent.setup()
    let postCalled = false

    server.use(
      http.post('http://localhost/api/tickets', () => {
        postCalled = true
        return HttpResponse.json(ticketFixture, { status: 201 })
      })
    )

    renderModal({ open: true })

    const submitBtn = screen.getByRole('button', { name: /crear/i })
    await user.click(submitBtn)

    // titulo error
    expect(await screen.findByText(/título es requerido/i)).toBeInTheDocument()
    expect(postCalled).toBe(false)
  })

  // T2.4-7: Blur on titulo empty → error shows
  it('shows titulo error on blur when field is empty', async () => {
    const user = userEvent.setup()
    renderModal({ open: true })

    const tituloInput = screen.getByRole('textbox', { name: /título/i })
    await user.click(tituloInput)
    await user.tab() // blur

    expect(await screen.findByText(/título es requerido/i)).toBeInTheDocument()
  })

  // T2.4-8: Submit with valid fields → 201 → success side effects
  it('on 201 success: calls notify.success, closes modal, and invalidates tickets', async () => {
    const user = userEvent.setup()
    const notifySuccess = vi.spyOn(notify.notify, 'success')
    const onOpenChange = vi.fn()

    const qc = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.post('http://localhost/api/tickets', async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(ticketFixture, { status: 201 })
      })
    )

    render(
      <QueryClientProvider client={qc}>
        <SessionProvider initialUser={userFixture}>
          <TicketFormModal
            mode="create"
            open={true}
            onOpenChange={onOpenChange}
          />
        </SessionProvider>
      </QueryClientProvider>
    )

    // Fill in titulo
    await user.type(screen.getByRole('textbox', { name: /título/i }), 'Mi ticket de prueba')

    // Select tipo: Soporte
    const tipoTrigger = screen.getByRole('combobox', { name: /tipo/i })
    await user.click(tipoTrigger)
    await user.click(within(document.body).getByRole('option', { name: 'Soporte' }))

    // Select prioridad: Baja
    const prioridadTrigger = screen.getByRole('combobox', { name: /prioridad/i })
    await user.click(prioridadTrigger)
    await user.click(within(document.body).getByRole('option', { name: 'Baja' }))

    // Submit
    await user.click(screen.getByRole('button', { name: /crear/i }))

    // Wait for async effects
    await screen.findByText(/ticket creado/i).catch(() => null)

    // solicitanteId must come from user.sub in the body
    expect(capturedBody.solicitanteId).toBe(userFixture.sub)

    // notify.success called
    expect(notifySuccess).toHaveBeenCalledWith(expect.any(String))

    // Modal closed
    expect(onOpenChange).toHaveBeenCalledWith(false)

    // invalidateQueries called with tickets
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['tickets'] })
    )
  })

  // T2.4-9: Submit → 422 → form-level banner + notify.error; modal stays open
  it('on 422: shows root error banner; modal stays open; notify.error called; notify.success NOT called', async () => {
    const user = userEvent.setup()
    const notifyError = vi.spyOn(notify.notify, 'error')
    const notifySuccess = vi.spyOn(notify.notify, 'success')
    const onOpenChange = vi.fn()

    server.use(
      http.post('http://localhost/api/tickets', () => {
        return HttpResponse.json(
          { statusCode: 422, message: 'Solicitante inválido', error: 'Unprocessable Entity' },
          { status: 422 }
        )
      })
    )

    render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
          })
        }
      >
        <SessionProvider initialUser={userFixture}>
          <TicketFormModal mode="create" open={true} onOpenChange={onOpenChange} />
        </SessionProvider>
      </QueryClientProvider>
    )

    await user.type(screen.getByRole('textbox', { name: /título/i }), 'test')

    const tipoTrigger = screen.getByRole('combobox', { name: /tipo/i })
    await user.click(tipoTrigger)
    await user.click(within(document.body).getByRole('option', { name: 'Soporte' }))

    const prioridadTrigger = screen.getByRole('combobox', { name: /prioridad/i })
    await user.click(prioridadTrigger)
    await user.click(within(document.body).getByRole('option', { name: 'Baja' }))

    await user.click(screen.getByRole('button', { name: /crear/i }))

    // Error banner with role="alert" should appear
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Solicitante inválido')

    // Modal stays open
    expect(onOpenChange).not.toHaveBeenCalledWith(false)

    // notify.error called; notify.success NOT called
    expect(notifyError).toHaveBeenCalled()
    expect(notifySuccess).not.toHaveBeenCalled()
  })

  // T2.4-10: Submit → network error → notify.error; modal stays open; no throw
  it('on network error: calls notify.error; modal stays open', async () => {
    const user = userEvent.setup()
    const notifyError = vi.spyOn(notify.notify, 'error')
    const onOpenChange = vi.fn()

    server.use(
      http.post('http://localhost/api/tickets', () => {
        return HttpResponse.error()
      })
    )

    render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
          })
        }
      >
        <SessionProvider initialUser={userFixture}>
          <TicketFormModal mode="create" open={true} onOpenChange={onOpenChange} />
        </SessionProvider>
      </QueryClientProvider>
    )

    await user.type(screen.getByRole('textbox', { name: /título/i }), 'test')

    const tipoTrigger = screen.getByRole('combobox', { name: /tipo/i })
    await user.click(tipoTrigger)
    await user.click(within(document.body).getByRole('option', { name: 'Soporte' }))

    const prioridadTrigger = screen.getByRole('combobox', { name: /prioridad/i })
    await user.click(prioridadTrigger)
    await user.click(within(document.body).getByRole('option', { name: 'Baja' }))

    await user.click(screen.getByRole('button', { name: /crear/i }))

    // Wait for error handling
    await screen.findByRole('alert').catch(() => null)

    expect(notifyError).toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  // T2.4-11: Submit button shows loading state while POST in flight
  it('submit button is disabled and shows loading state while POST in flight', async () => {
    const user = userEvent.setup()

    server.use(
      http.post('http://localhost/api/tickets', async () => {
        await delay(100)
        return HttpResponse.json(ticketFixture, { status: 201 })
      })
    )

    renderModal({ open: true })

    await user.type(screen.getByRole('textbox', { name: /título/i }), 'test')

    const tipoTrigger = screen.getByRole('combobox', { name: /tipo/i })
    await user.click(tipoTrigger)
    await user.click(within(document.body).getByRole('option', { name: 'Soporte' }))

    const prioridadTrigger = screen.getByRole('combobox', { name: /prioridad/i })
    await user.click(prioridadTrigger)
    await user.click(within(document.body).getByRole('option', { name: 'Baja' }))

    const submitBtn = screen.getByRole('button', { name: /crear/i })
    await user.click(submitBtn)

    // While in flight, button should be disabled
    await new Promise((r) => setTimeout(r, 20))
    expect(submitBtn).toBeDisabled()
  })

  // T2.4-12: ESC closes modal; POST NOT dispatched
  it('ESC closes modal without dispatching POST', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    let postCalled = false

    server.use(
      http.post('http://localhost/api/tickets', () => {
        postCalled = true
        return HttpResponse.json(ticketFixture, { status: 201 })
      })
    )

    renderModal({ open: true, onOpenChange })
    const dialog = screen.getByRole('dialog')
    await user.keyboard('{Escape}')

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(postCalled).toBe(false)
  })
})

// ─── S3/T3.4 — Edit mode ─────────────────────────────────────────────────────

describe('TicketFormModal (edit)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // T3.4-1: pre-fills titulo from ticket fixture
  it('pre-fills titulo input with ticket.titulo', () => {
    renderModal({ mode: 'edit', ticket: editTicketFixture })
    const tituloInput = screen.getByRole('textbox', { name: /título/i })
    expect(tituloInput).toHaveValue(editTicketFixture.titulo)
  })

  // T3.4-2: pre-fills descripcion from ticket fixture
  it('pre-fills descripcion textarea with ticket.descripcion', () => {
    renderModal({ mode: 'edit', ticket: editTicketFixture })
    const descInput = screen.getByRole('textbox', { name: /descripción/i })
    expect(descInput).toHaveValue(editTicketFixture.descripcion ?? '')
  })

  // T3.4-3: prioridad Select shows the pre-selected value
  it('pre-selects prioridadId in the Select trigger', () => {
    renderModal({ mode: 'edit', ticket: editTicketFixture })
    // prioridadId = d0000000...0002 = "Media"
    const prioridadTrigger = screen.getByRole('combobox', { name: /prioridad/i })
    expect(prioridadTrigger).toHaveTextContent('Media')
  })

  // T3.4-4: NO tipoId field in the DOM (tipo is immutable)
  it('does NOT render a tipoId or tipo field in edit mode', () => {
    renderModal({ mode: 'edit', ticket: editTicketFixture })
    expect(document.querySelector('[name="tipoId"]')).toBeNull()
    expect(document.querySelector('[name="tipo"]')).toBeNull()
    // Also verify no "Tipo" combobox is rendered
    expect(screen.queryByRole('combobox', { name: /tipo/i })).not.toBeInTheDocument()
  })

  // T3.4-5: NO estado field in the DOM (estado is managed via dedicated endpoints)
  it('does NOT render an estado field in edit mode', () => {
    renderModal({ mode: 'edit', ticket: editTicketFixture })
    expect(document.querySelector('[name="estado"]')).toBeNull()
    expect(document.querySelector('[name="estadoId"]')).toBeNull()
  })

  // T3.4-6: PATCH body does NOT include tipoId or estado
  it('PATCH body does NOT include tipoId or estado on submit', async () => {
    const user = userEvent.setup()
    let capturedBody: Record<string, unknown> = {}

    server.use(
      http.patch('http://localhost/api/tickets/:id', async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ ...editTicketFixture, titulo: 'Nuevo título' }, { status: 200 })
      })
    )

    renderModal({ mode: 'edit', ticket: editTicketFixture })

    // Modify titulo
    const tituloInput = screen.getByRole('textbox', { name: /título/i })
    await user.clear(tituloInput)
    await user.type(tituloInput, 'Nuevo título')

    await user.click(screen.getByRole('button', { name: /guardar/i }))

    // Wait for async effects
    await new Promise((r) => setTimeout(r, 50))

    expect('tipoId' in capturedBody).toBe(false)
    expect('estado' in capturedBody).toBe(false)
    expect('estadoId' in capturedBody).toBe(false)
  })

  // T3.4-7: PATCH 200 → notify.success + modal closes + invalidateQueries
  it('on PATCH 200: calls notify.success, closes modal, and invalidates queries', async () => {
    const user = userEvent.setup()
    const notifySuccess = vi.spyOn(notify.notify, 'success')
    const onOpenChange = vi.fn()

    const qc = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    server.use(
      http.patch('http://localhost/api/tickets/:id', async () => {
        return HttpResponse.json({ ...editTicketFixture, titulo: 'Actualizado' }, { status: 200 })
      })
    )

    render(
      <QueryClientProvider client={qc}>
        <SessionProvider initialUser={userFixture}>
          <TicketFormModal
            mode="edit"
            open={true}
            onOpenChange={onOpenChange}
            ticket={editTicketFixture}
          />
        </SessionProvider>
      </QueryClientProvider>
    )

    await user.click(screen.getByRole('button', { name: /guardar/i }))

    // Wait for async effects
    await new Promise((r) => setTimeout(r, 50))

    expect(notifySuccess).toHaveBeenCalledWith(expect.any(String))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['tickets'] })
    )
  })

  // T3.4-8: PATCH 422 → root banner + modal stays + notify.error
  it('on PATCH 422: shows root error banner; modal stays open; notify.error called', async () => {
    const user = userEvent.setup()
    const notifyError = vi.spyOn(notify.notify, 'error')
    const notifySuccess = vi.spyOn(notify.notify, 'success')
    const onOpenChange = vi.fn()

    server.use(
      http.patch('http://localhost/api/tickets/:id', () => {
        return HttpResponse.json(
          { statusCode: 422, message: 'Ciclo inválido', error: 'Unprocessable Entity' },
          { status: 422 }
        )
      })
    )

    render(
      <QueryClientProvider
        client={new QueryClient({
          defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
        })}
      >
        <SessionProvider initialUser={userFixture}>
          <TicketFormModal
            mode="edit"
            open={true}
            onOpenChange={onOpenChange}
            ticket={editTicketFixture}
          />
        </SessionProvider>
      </QueryClientProvider>
    )

    await user.click(screen.getByRole('button', { name: /guardar/i }))

    // Error banner should appear
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Ciclo inválido')

    // Modal stays open
    expect(onOpenChange).not.toHaveBeenCalledWith(false)

    expect(notifyError).toHaveBeenCalled()
    expect(notifySuccess).not.toHaveBeenCalled()
  })

  // T3.4-9: PATCH 404 → notify.error + modal closes + invalidateQueries
  it('on PATCH 404: calls notify.error with "ya no existe" message; modal closes; invalidates queries', async () => {
    const user = userEvent.setup()
    const notifyError = vi.spyOn(notify.notify, 'error')
    const onOpenChange = vi.fn()

    const qc = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    server.use(
      http.patch('http://localhost/api/tickets/:id', () => {
        return HttpResponse.json(
          { statusCode: 404, message: 'Not Found', error: 'Not Found' },
          { status: 404 }
        )
      })
    )

    render(
      <QueryClientProvider client={qc}>
        <SessionProvider initialUser={userFixture}>
          <TicketFormModal
            mode="edit"
            open={true}
            onOpenChange={onOpenChange}
            ticket={editTicketFixture}
          />
        </SessionProvider>
      </QueryClientProvider>
    )

    await user.click(screen.getByRole('button', { name: /guardar/i }))

    await new Promise((r) => setTimeout(r, 50))

    // notify.error called with the "ya no existe" message (mapApiError 404 branch)
    expect(notifyError).toHaveBeenCalledWith(expect.stringMatching(/ya no existe/i))

    // Modal closes (onClose is called)
    expect(onOpenChange).toHaveBeenCalledWith(false)

    // Invalidate all so the list refreshes and shows the ticket is gone
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['tickets'] })
    )
  })

  // T3.4-10: Submit button loading state in edit mode
  it('submit button is disabled while PATCH is in flight', async () => {
    const user = userEvent.setup()

    server.use(
      http.patch('http://localhost/api/tickets/:id', async () => {
        await delay(100)
        return HttpResponse.json({ ...editTicketFixture }, { status: 200 })
      })
    )

    renderModal({ mode: 'edit', ticket: editTicketFixture })

    const submitBtn = screen.getByRole('button', { name: /guardar/i })
    await user.click(submitBtn)

    await new Promise((r) => setTimeout(r, 20))
    expect(submitBtn).toBeDisabled()
  })
})
