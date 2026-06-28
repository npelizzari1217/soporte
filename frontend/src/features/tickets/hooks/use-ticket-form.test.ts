/**
 * Tests for useTicketForm (PR5 — T5.3).
 *
 * TDD: RED tests written before implementation (T5.4).
 * Uses renderHook with QueryClientProvider.
 * useSession is mocked (pure data hook test — no SessionProvider needed).
 * MSW intercepts POST /api/tickets for submit tests.
 *
 * Contract asserted:
 *   1. Create mode with defaultTipoId → tipoId pre-populated in form.
 *   2. Create mode without defaultTipoId → tipoId = '' (stable default).
 *   3. Create mode → fechaCreacion defaults to today (YYYY-MM-DD).
 *   4. Edit mode: form values do NOT include fechaResolucion.
 *   5. Submit create → POST body includes fechaCreacion.
 *
 * Spec: tickets-list-filtros-resolucion ADR-9
 * Design: T5.4 — useTicketForm with defaultTipoId + fechaCreacion default
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../test/msw/server'
import { useTicketForm } from './use-ticket-form'
import type { JwtPayload } from '@/shared/api/types'
import type { Ticket } from '../types'
import * as React from 'react'

// Mock useSession — this is a pure hook test, no SessionProvider needed
vi.mock('@/shared/hooks/use-session', () => ({
  useSession: () => ({
    user: { sub: 'user-test-sub', cliente_id: 'c1', email: 'test@example.com', roles: [], permisos: [] } satisfies JwtPayload,
    isLoading: false,
    can: () => true,
  }),
}))

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ticketFixture: Ticket = {
  id: 'ticket-edit-001',
  numero: 'SOP-2026-00001',
  titulo: 'Titulo existente',
  descripcion: 'Descripcion existente',
  tipoId: 'e0000000-0000-4000-e000-000000000001',
  estadoId: 'c0000000-0000-4000-c000-000000000001',
  prioridadId: 'd0000000-0000-4000-d000-000000000002',
  cicloId: null,
  solicitanteId: 'user-test-sub',
  asignadoId: null,
  fechaResolucion: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const createdTicketFixture: Ticket = {
  ...ticketFixture,
  id: 'ticket-new-1',
  numero: 'SOP-2026-00099',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
}

function makeQC() {
  return new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useTicketForm — PR5 ADR-9', () => {
  let qc: QueryClient

  beforeEach(() => {
    qc = makeQC()
    vi.restoreAllMocks()
  })

  // T5.3-1: create mode with defaultTipoId pre-populates tipoId
  // RED: UseTicketFormOpts doesn't accept defaultTipoId yet → tipoId stays ''
  it('create mode with defaultTipoId pre-populates tipoId', () => {
    const defaultTipoId = 'e0000000-0000-4000-e000-000000000001'
    const { result } = renderHook(
      () => useTicketForm('create', { onClose: vi.fn(), defaultTipoId }),
      { wrapper: makeWrapper(qc) },
    )
    expect(result.current.form.getValues('tipoId')).toBe(defaultTipoId)
  })

  // T5.3-2: create mode without defaultTipoId → tipoId = '' (stable default)
  it('create mode without defaultTipoId starts with empty tipoId', () => {
    const { result } = renderHook(
      () => useTicketForm('create', { onClose: vi.fn() }),
      { wrapper: makeWrapper(qc) },
    )
    expect(result.current.form.getValues('tipoId')).toBe('')
  })

  // T5.3-3: create mode → fechaCreacion default = today (YYYY-MM-DD)
  // RED: defaultValues doesn't include fechaCreacion yet → returns undefined
  it('create mode defaults fechaCreacion to today in YYYY-MM-DD format', () => {
    const today = new Date().toISOString().slice(0, 10)
    const { result } = renderHook(
      () => useTicketForm('create', { onClose: vi.fn() }),
      { wrapper: makeWrapper(qc) },
    )
    expect(result.current.form.getValues('fechaCreacion')).toBe(today)
  })

  // T5.3-4: edit mode — form values do NOT include fechaResolucion
  // (never was a form field; mapTicketToForm doesn't set it)
  it('edit mode: form values do NOT include fechaResolucion', () => {
    const { result } = renderHook(
      () => useTicketForm('edit', { onClose: vi.fn(), ticket: ticketFixture }),
      { wrapper: makeWrapper(qc) },
    )
    const values = result.current.form.getValues()
    expect('fechaResolucion' in values).toBe(false)
  })

  // T5.3-5: submit create → POST body includes fechaCreacion
  // RED: fechaCreacion not in defaultValues → not included in submit body
  it('submit create includes fechaCreacion in the POST body', async () => {
    const today = new Date().toISOString().slice(0, 10)
    let capturedBody: Record<string, unknown> = {}

    server.use(
      http.post('http://localhost/api/tickets', async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(createdTicketFixture, { status: 201 })
      }),
    )

    const onClose = vi.fn()
    const { result } = renderHook(
      () => useTicketForm('create', { onClose }),
      { wrapper: makeWrapper(qc) },
    )

    // Set required fields + let fechaCreacion come from defaultValues
    act(() => {
      result.current.form.setValue('titulo', 'Nuevo ticket de prueba')
      result.current.form.setValue('tipoId', 'e0000000-0000-4000-e000-000000000001')
      result.current.form.setValue('prioridadId', 'd0000000-0000-4000-d000-000000000001')
    })

    await act(async () => {
      // onSubmit is form.handleSubmit(internalOnSubmit) — callable without a DOM event
      await (result.current.onSubmit as () => Promise<void>)()
    })

    await waitFor(() => expect(onClose).toHaveBeenCalled())

    expect(capturedBody.fechaCreacion).toBe(today)
  })
})
