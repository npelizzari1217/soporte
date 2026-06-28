/**
 * Tests for useUpdateTicket hook (Slice 3 — S3/T3.2).
 *
 * TDD: RED test written before implementation.
 * MSW intercepts PATCH /api/tickets/:id — no real network.
 * SessionProvider not needed: hook is a pure data hook.
 *
 * Spec: tickets-ui §req Hooks de mutación (escenarios useUpdateTicket)
 * Design: design.md §1.7 — convención de hooks de mutación
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { http, HttpResponse, delay } from 'msw'
import { server } from '../../../../test/msw/server'
import { useUpdateTicket } from './use-update-ticket'
import type { UpdateTicketInput } from '../schemas'
import type { Ticket } from '../types'
import * as React from 'react'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ticketId = 'ticket-edit-uuid-001'
const prioridadId = 'd0000000-0000-4000-d000-000000000002'

const updateDto: UpdateTicketInput = {
  titulo: 'Título actualizado',
  prioridadId,
}

const updatedTicket: Ticket = {
  id: ticketId,
  numero: 'SOP-2026-00001',
  titulo: 'Título actualizado',
  descripcion: null,
  tipoId: 'e0000000-0000-4000-e000-000000000001',
  estadoId: 'c0000000-0000-4000-c000-000000000001',
  prioridadId,
  cicloId: null,
  solicitanteId: 'user-sub-abc',
  asignadoId: null,
  fechaResolucion: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useUpdateTicket', () => {
  let qc: QueryClient

  beforeEach(() => {
    qc = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    })
  })

  // T3.2-1: sends PATCH /api/tickets/:id with the dto as JSON body
  it('sends PATCH /api/tickets/:id with dto as JSON body', async () => {
    let interceptedUrl = ''
    let interceptedBody: unknown = null

    server.use(
      http.patch('http://localhost/api/tickets/:id', async ({ request, params }) => {
        interceptedUrl = params.id as string
        interceptedBody = await request.json()
        return HttpResponse.json(updatedTicket, { status: 200 })
      })
    )

    const { result } = renderHook(() => useUpdateTicket(), {
      wrapper: makeWrapper(qc),
    })

    await act(async () => {
      await result.current.mutateAsync({ id: ticketId, dto: updateDto })
    })

    expect(interceptedUrl).toBe(ticketId)
    expect(interceptedBody).toMatchObject(updateDto)
  })

  // T3.2-2: PATCH body does NOT include tipoId or estado
  it('PATCH body does NOT include tipoId or estado', async () => {
    let capturedBody: Record<string, unknown> = {}

    server.use(
      http.patch('http://localhost/api/tickets/:id', async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(updatedTicket, { status: 200 })
      })
    )

    const { result } = renderHook(() => useUpdateTicket(), {
      wrapper: makeWrapper(qc),
    })

    await act(async () => {
      await result.current.mutateAsync({ id: ticketId, dto: updateDto })
    })

    expect('tipoId' in capturedBody).toBe(false)
    expect('estado' in capturedBody).toBe(false)
    expect('estadoId' in capturedBody).toBe(false)
  })

  // T3.2-3: success (200) calls invalidateQueries with tickets.all
  it('calls invalidateQueries with queryKeys.tickets.all on 200 success', async () => {
    server.use(
      http.patch('http://localhost/api/tickets/:id', async () => {
        return HttpResponse.json(updatedTicket, { status: 200 })
      })
    )

    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateTicket(), {
      wrapper: makeWrapper(qc),
    })

    await act(async () => {
      await result.current.mutateAsync({ id: ticketId, dto: updateDto })
    })

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['tickets'] })
    )
  })

  // T3.2-4: success (200) also calls invalidateQueries with tickets.detail(id)
  it('calls invalidateQueries with queryKeys.tickets.detail(id) on 200 success', async () => {
    server.use(
      http.patch('http://localhost/api/tickets/:id', async () => {
        return HttpResponse.json(updatedTicket, { status: 200 })
      })
    )

    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateTicket(), {
      wrapper: makeWrapper(qc),
    })

    await act(async () => {
      await result.current.mutateAsync({ id: ticketId, dto: updateDto })
    })

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['tickets', ticketId] })
    )
  })

  // T3.2-5: error 422 → mutation rejected with ApiError.statusCode === 422; invalidateQueries NOT called
  it('rejects with ApiError statusCode 422 on 422 response; invalidateQueries NOT called', async () => {
    server.use(
      http.patch('http://localhost/api/tickets/:id', () => {
        return HttpResponse.json(
          { statusCode: 422, message: 'Ciclo inválido', error: 'Unprocessable Entity' },
          { status: 422 }
        )
      })
    )

    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateTicket(), {
      wrapper: makeWrapper(qc),
    })

    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: ticketId, dto: updateDto })
      ).rejects.toMatchObject({ statusCode: 422 })
    })

    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  // T3.2-6: isPending true while PATCH in flight; false after response
  it('isPending is true while PATCH is in flight; false after 200', async () => {
    server.use(
      http.patch('http://localhost/api/tickets/:id', async () => {
        await delay(50)
        return HttpResponse.json(updatedTicket, { status: 200 })
      })
    )

    const { result } = renderHook(() => useUpdateTicket(), {
      wrapper: makeWrapper(qc),
    })

    act(() => {
      result.current.mutateAsync({ id: ticketId, dto: updateDto }).catch(() => {})
    })

    await new Promise((r) => setTimeout(r, 10))
    expect(result.current.isPending).toBe(true)

    // Wait for completion
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })
    expect(result.current.isPending).toBe(false)
  })
})
