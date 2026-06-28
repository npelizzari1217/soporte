/**
 * Tests for useCreateTicket hook (Slice 2 — S2/T2.2).
 *
 * TDD: RED test written before implementation.
 * MSW intercepts POST /api/tickets — no real network.
 * SessionProvider not needed: hook is a pure data hook, no UI effects.
 *
 * Spec: tickets-ui §req Hooks de mutación (escenarios useCreateTicket)
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { http, HttpResponse, delay } from 'msw'
import { server } from '../../../../test/msw/server'
import { useCreateTicket } from './use-create-ticket'
import type { CreateTicketInput } from '../schemas'
import type { Ticket } from '../types'
import * as React from 'react'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const uuid = 'd0000000-0000-4000-d000-000000000001'

const validDto: CreateTicketInput = {
  titulo: 'Falla en red',
  tipoId: 'e0000000-0000-4000-e000-000000000001',
  prioridadId: uuid,
  solicitanteId: 'user-sub-abc',
}

const ticketFixture: Ticket = {
  id: 'ticket-new-1',
  numero: 'SOP-2026-00099',
  titulo: 'Falla en red',
  descripcion: null,
  tipoId: 'e0000000-0000-4000-e000-000000000001',
  estadoId: 'c0000000-0000-4000-c000-000000000001',
  prioridadId: uuid,
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

describe('useCreateTicket', () => {
  let qc: QueryClient

  beforeEach(() => {
    qc = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    })
  })

  it('exposes mutateAsync, isPending and error', () => {
    const { result } = renderHook(() => useCreateTicket(), {
      wrapper: makeWrapper(qc),
    })
    expect(result.current.mutateAsync).toBeDefined()
    expect(result.current.isPending).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('sends POST /api/tickets with the dto as JSON body', async () => {
    let interceptedBody: unknown = null

    server.use(
      http.post('http://localhost/api/tickets', async ({ request }) => {
        interceptedBody = await request.json()
        return HttpResponse.json(ticketFixture, { status: 201 })
      })
    )

    const { result } = renderHook(() => useCreateTicket(), {
      wrapper: makeWrapper(qc),
    })

    await act(async () => {
      await result.current.mutateAsync(validDto)
    })

    expect(interceptedBody).toMatchObject(validDto)
  })

  it('isPending is true while the request is in flight', async () => {
    server.use(
      http.post('http://localhost/api/tickets', async () => {
        await delay(50)
        return HttpResponse.json(ticketFixture, { status: 201 })
      })
    )

    const { result } = renderHook(() => useCreateTicket(), {
      wrapper: makeWrapper(qc),
    })

    let pendingDuringFlight = false

    act(() => {
      result.current.mutateAsync(validDto).then(() => {
        /* completed */
      }).catch(() => {
        /* ignore */
      })
    })

    // Give the mutation a tick to start
    await new Promise((r) => setTimeout(r, 10))
    pendingDuringFlight = result.current.isPending

    expect(pendingDuringFlight).toBe(true)
  })

  it('isPending is false after a successful 201 response', async () => {
    server.use(
      http.post('http://localhost/api/tickets', async () => {
        return HttpResponse.json(ticketFixture, { status: 201 })
      })
    )

    const { result } = renderHook(() => useCreateTicket(), {
      wrapper: makeWrapper(qc),
    })

    await act(async () => {
      await result.current.mutateAsync(validDto)
    })

    expect(result.current.isPending).toBe(false)
  })

  it('calls invalidateQueries with queryKey ["tickets"] on 201 success', async () => {
    server.use(
      http.post('http://localhost/api/tickets', async () => {
        return HttpResponse.json(ticketFixture, { status: 201 })
      })
    )

    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useCreateTicket(), {
      wrapper: makeWrapper(qc),
    })

    await act(async () => {
      await result.current.mutateAsync(validDto)
    })

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['tickets'] })
    )
  })

  it('rejects with an ApiError with statusCode 422 on 422 response', async () => {
    server.use(
      http.post('http://localhost/api/tickets', () => {
        return HttpResponse.json(
          { statusCode: 422, message: 'Solicitante inválido', error: 'Unprocessable Entity' },
          { status: 422 }
        )
      })
    )

    const { result } = renderHook(() => useCreateTicket(), {
      wrapper: makeWrapper(qc),
    })

    await act(async () => {
      await expect(result.current.mutateAsync(validDto)).rejects.toMatchObject({
        statusCode: 422,
      })
    })
  })

  it('does NOT call invalidateQueries on 422 error', async () => {
    server.use(
      http.post('http://localhost/api/tickets', () => {
        return HttpResponse.json(
          { statusCode: 422, message: 'Error de dominio', error: 'Unprocessable Entity' },
          { status: 422 }
        )
      })
    )

    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useCreateTicket(), {
      wrapper: makeWrapper(qc),
    })

    await act(async () => {
      await result.current.mutateAsync(validDto).catch(() => {
        /* expected */
      })
    })

    expect(invalidateSpy).not.toHaveBeenCalled()
  })
})
