/**
 * Tests for useDeleteTicket hook (Slice 4 — S4/T4.1).
 *
 * TDD: RED test written before implementation.
 * MSW intercepts DELETE /api/tickets/:id — no real network.
 * SessionProvider not needed: hook is a pure data hook.
 *
 * 204 No Content: apiFetch<void> returns undefined (normalize.ts handles it).
 * Idempotent: re-deleting a non-existent ticket also returns 204.
 *
 * Spec: tickets-ui §req Hooks de mutación (escenarios useDeleteTicket)
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
import { useDeleteTicket } from './use-delete-ticket'
import * as React from 'react'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ticketId = 'ticket-delete-uuid-001'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useDeleteTicket', () => {
  let qc: QueryClient

  beforeEach(() => {
    qc = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    })
  })

  // T4.1-1: sends DELETE /api/tickets/:id (verify URL intercepted by MSW)
  it('sends DELETE /api/tickets/:id', async () => {
    let interceptedId = ''

    server.use(
      http.delete('http://localhost/api/tickets/:id', ({ params }) => {
        interceptedId = params.id as string
        return new HttpResponse(null, { status: 204 })
      })
    )

    const { result } = renderHook(() => useDeleteTicket(), {
      wrapper: makeWrapper(qc),
    })

    await act(async () => {
      await result.current.mutateAsync(ticketId)
    })

    expect(interceptedId).toBe(ticketId)
  })

  // T4.1-2: 204 → calls invalidateQueries with queryKeys.tickets.all
  it('calls invalidateQueries with queryKeys.tickets.all on 204', async () => {
    server.use(
      http.delete('http://localhost/api/tickets/:id', () => {
        return new HttpResponse(null, { status: 204 })
      })
    )

    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteTicket(), {
      wrapper: makeWrapper(qc),
    })

    await act(async () => {
      await result.current.mutateAsync(ticketId)
    })

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['tickets'] })
    )
  })

  // T4.1-3: 204 idempotente — re-deleting calls same invalidation, no error
  it('204 idempotente (re-delete) → same invalidation, no error on second call', async () => {
    server.use(
      http.delete('http://localhost/api/tickets/:id', () => {
        // Backend returns 204 for already-deleted tickets too (idempotent)
        return new HttpResponse(null, { status: 204 })
      })
    )

    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteTicket(), {
      wrapper: makeWrapper(qc),
    })

    // First call
    await act(async () => {
      await result.current.mutateAsync(ticketId)
    })

    // Second call (idempotent — already deleted ticket still returns 204)
    await act(async () => {
      await result.current.mutateAsync(ticketId)
    })

    // invalidateQueries called once per successful mutation (2 total)
    expect(invalidateSpy).toHaveBeenCalledTimes(2)
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['tickets'] })
    )
  })

  // T4.1-4: apiFetch returns undefined on 204 → mutation resolves without body-parse error
  it('mutation resolves with undefined on 204 (no body parse error)', async () => {
    server.use(
      http.delete('http://localhost/api/tickets/:id', () => {
        // 204 No Content: no body
        return new HttpResponse(null, { status: 204 })
      })
    )

    const { result } = renderHook(() => useDeleteTicket(), {
      wrapper: makeWrapper(qc),
    })

    let resolvedValue: unknown = 'NOT_RESOLVED'

    await act(async () => {
      // apiFetch<void> normalizes 204 → returns undefined (normalize.ts)
      resolvedValue = await result.current.mutateAsync(ticketId)
    })

    expect(resolvedValue).toBeUndefined()
  })

  // T4.1-5: isPending true while DELETE in flight; false after 204
  it('isPending is true while DELETE is in flight; false after 204', async () => {
    server.use(
      http.delete('http://localhost/api/tickets/:id', async () => {
        await delay(50)
        return new HttpResponse(null, { status: 204 })
      })
    )

    const { result } = renderHook(() => useDeleteTicket(), {
      wrapper: makeWrapper(qc),
    })

    act(() => {
      result.current.mutateAsync(ticketId).catch(() => {})
    })

    // While in flight
    await new Promise((r) => setTimeout(r, 10))
    expect(result.current.isPending).toBe(true)

    // After completion
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })
    expect(result.current.isPending).toBe(false)
  })

  // T4.1-6: network error → mutation rejected with ApiError(statusCode=0); invalidateQueries NOT called
  it('network error → rejects with ApiError statusCode 0; invalidateQueries NOT called', async () => {
    server.use(
      http.delete('http://localhost/api/tickets/:id', () => {
        return HttpResponse.error()
      })
    )

    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteTicket(), {
      wrapper: makeWrapper(qc),
    })

    await act(async () => {
      await expect(
        result.current.mutateAsync(ticketId)
      ).rejects.toMatchObject({ statusCode: 0 })
    })

    expect(invalidateSpy).not.toHaveBeenCalled()
  })
})
