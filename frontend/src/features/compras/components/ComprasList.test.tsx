/**
 * ComprasList unit tests (S5a — CardRow migration).
 *
 * Verifies that ComprasList renders as card rows (NOT a <table>) and that:
 * - Badge tones match ESTADO_TONE from catalogos.ts.
 * - AprobacionCell logic is preserved (Rechazada / Aprobada / —).
 *
 * Atomicity: local fixtures only, no network, no MSW.
 * Integration tests (ComprasPage.test.tsx) cover the full connected behavior.
 *
 * Spec: [SPEC:frontend-design-system/req-8-filas-tarjeta]
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ComprasList } from './ComprasList'
import type { Compra } from '../types'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ESTADO_APROBADO  = 'c0000000-0000-4000-c000-000000000003' // Aprobado → success → bg-emerald-500/10
const ESTADO_RECHAZADO = 'c0000000-0000-4000-c000-000000000004' // Rechazado → danger → bg-red-500/10
const ESTADO_PENDIENTE = 'c0000000-0000-4000-c000-000000000002' // Pendiente → warning → bg-amber-500/10

const aprobadaCompra: Compra = {
  id: 'compra-1',
  ticketId: 'ticket-1',
  numero: 'CMP-2026-00001',
  titulo: 'Compra de materiales',
  estadoId: ESTADO_APROBADO,
  aprobadoPorId: 'user-admin',
  aprobadoEn: '2026-01-20T14:00:00Z',
  motivoRechazo: null,
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-20T14:00:00Z',
}

const rechazadaCompra: Compra = {
  id: 'compra-2',
  ticketId: 'ticket-2',
  numero: 'CMP-2026-00002',
  titulo: 'Equipos de cómputo',
  estadoId: ESTADO_RECHAZADO,
  aprobadoPorId: null,
  aprobadoEn: null,
  motivoRechazo: 'Presupuesto insuficiente',
  createdAt: '2026-01-14T09:00:00Z',
  updatedAt: '2026-01-16T09:00:00Z',
}

const pendienteCompra: Compra = {
  id: 'compra-3',
  ticketId: 'ticket-3',
  numero: 'CMP-2026-00003',
  titulo: 'Sillas ergonómicas',
  estadoId: ESTADO_PENDIENTE,
  aprobadoPorId: null,
  aprobadoEn: null,
  motivoRechazo: null,
  createdAt: '2026-01-18T11:00:00Z',
  updatedAt: '2026-01-18T11:00:00Z',
}

const mockCompras = [aprobadaCompra, rechazadaCompra, pendienteCompra]

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ComprasList', () => {
  // ─── Layout: no table ──────────────────────────────────────────────────────

  it('renders NO <table> element (migrated to card rows)', () => {
    render(<ComprasList compras={mockCompras} />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders NO <tr> elements', () => {
    const { container } = render(<ComprasList compras={mockCompras} />)
    expect(container.querySelector('tr')).toBeNull()
  })

  // ─── Content ───────────────────────────────────────────────────────────────

  it('renders each compra title as visible text', () => {
    render(<ComprasList compras={mockCompras} />)
    expect(screen.getByText('Compra de materiales')).toBeInTheDocument()
    expect(screen.getByText('Equipos de cómputo')).toBeInTheDocument()
    expect(screen.getByText('Sillas ergonómicas')).toBeInTheDocument()
  })

  // ─── Badge tones ───────────────────────────────────────────────────────────

  it('estado Aprobado badge has success tone (bg-emerald-500/10)', () => {
    render(<ComprasList compras={[aprobadaCompra]} />)
    const badge = screen.getByText('Aprobado').closest('span')
    expect(badge?.className).toContain('bg-emerald-500/10')
  })

  it('estado Rechazado badge has danger tone (bg-red-500/10)', () => {
    render(<ComprasList compras={[rechazadaCompra]} />)
    const badge = screen.getByText('Rechazado').closest('span')
    expect(badge?.className).toContain('bg-red-500/10')
  })

  it('estado Pendiente de aprobación badge has warning tone (bg-amber-500/10)', () => {
    render(<ComprasList compras={[pendienteCompra]} />)
    const badge = screen.getByText('Pendiente de aprobación').closest('span')
    expect(badge?.className).toContain('bg-amber-500/10')
  })

  // ─── AprobacionCell logic preserved ────────────────────────────────────────

  it('shows "Aprobada" text for a compra with aprobadoEn (no motivoRechazo)', () => {
    render(<ComprasList compras={[aprobadaCompra]} />)
    expect(screen.getByText(/Aprobada/)).toBeInTheDocument()
  })

  it('shows "Rechazada" text and motivo for a compra with motivoRechazo', () => {
    render(<ComprasList compras={[rechazadaCompra]} />)
    expect(screen.getByText(/Rechazada/)).toBeInTheDocument()
    expect(screen.getByTitle('Presupuesto insuficiente')).toBeInTheDocument()
  })

  it('shows "—" for a compra with neither aprobadoEn nor motivoRechazo', () => {
    render(<ComprasList compras={[pendienteCompra]} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('rejected compra with both motivoRechazo and aprobadoEn shows "Rechazada" (rejection wins)', () => {
    // Edge case documented in the original ComprasList: both fields can coexist
    const ambiguousCompra: Compra = {
      ...rechazadaCompra,
      aprobadoEn: '2026-01-20T14:00:00Z', // has both
    }
    render(<ComprasList compras={[ambiguousCompra]} />)
    expect(screen.getByText(/Rechazada/)).toBeInTheDocument()
    expect(screen.queryByText(/Aprobada/)).not.toBeInTheDocument()
  })
})
