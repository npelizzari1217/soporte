/**
 * ReparacionesList unit tests (S5b — CardRow migration).
 *
 * Verifies that ReparacionesList renders as card rows (NOT a <table>) and that
 * badge tones match the ESTADO_TONE map from catalogos.ts.
 * AvanceCell text output (e.g. "55%") is also asserted — the progress bar and
 * percentage span are both part of the migrated card.
 *
 * Atomicity contract: local fixtures only, no network, no MSW.
 *
 * Spec: [SPEC:frontend-design-system/req-8-filas-tarjeta]
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ReparacionesList } from './ReparacionesList'
import type { Reparacion } from '../types'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ESTADO_EN_PROG = 'c0000000-0000-4000-c000-000000000005' // En progreso → info → bg-blue-500/10
const ESTADO_RESUELTO = 'c0000000-0000-4000-c000-000000000006' // Resuelto → success → bg-emerald-500/10

const mockReparaciones: Reparacion[] = [
  {
    id: 'rep-1',
    ticketId: 'ticket-1',
    numero: 'REP-2026-00001',
    titulo: 'Cambio de vidrio roto en oficina 3',
    estadoId: ESTADO_EN_PROG,
    ubicacionId: 'ubic-1',
    ubicacionNombre: 'Oficina 3',
    porcentajeAvance: 55,
    createdAt: '2026-02-10T08:00:00Z',
    updatedAt: '2026-02-10T08:00:00Z',
  },
  {
    id: 'rep-2',
    ticketId: 'ticket-2',
    numero: 'REP-2026-00002',
    titulo: 'Reparación de cañería en baño',
    estadoId: ESTADO_RESUELTO,
    ubicacionId: 'ubic-2',
    ubicacionNombre: null,
    porcentajeAvance: 100,
    createdAt: '2026-02-05T09:00:00Z',
    updatedAt: '2026-02-05T09:00:00Z',
  },
]

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ReparacionesList', () => {
  // ─── Layout: no table ──────────────────────────────────────────────────────

  it('renders NO <table> element (migrated to card rows)', () => {
    render(<ReparacionesList reparaciones={mockReparaciones} />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders NO <tr> elements', () => {
    const { container } = render(<ReparacionesList reparaciones={mockReparaciones} />)
    expect(container.querySelector('tr')).toBeNull()
  })

  // ─── Content ───────────────────────────────────────────────────────────────

  it('renders each reparacion title as visible text', () => {
    render(<ReparacionesList reparaciones={mockReparaciones} />)
    expect(screen.getByText('Cambio de vidrio roto en oficina 3')).toBeInTheDocument()
    expect(screen.getByText('Reparación de cañería en baño')).toBeInTheDocument()
  })

  it('renders reparacion number in subtitle', () => {
    render(<ReparacionesList reparaciones={[mockReparaciones[0]]} />)
    expect(screen.getByText('REP-2026-00001')).toBeInTheDocument()
  })

  // ─── AvanceCell ────────────────────────────────────────────────────────────

  it('renders porcentajeAvance as visible text (e.g. "55%")', () => {
    render(<ReparacionesList reparaciones={[mockReparaciones[0]]} />)
    expect(screen.getByText('55%')).toBeInTheDocument()
  })

  it('renders 100% for a fully completed reparacion', () => {
    render(<ReparacionesList reparaciones={[mockReparaciones[1]]} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  // ─── Badge tones ───────────────────────────────────────────────────────────

  it('estado En progreso badge has info tone (bg-blue-500/10)', () => {
    render(<ReparacionesList reparaciones={[mockReparaciones[0]]} />)
    const badge = screen.getByText('En progreso').closest('span')
    expect(badge?.className).toContain('bg-blue-500/10')
  })

  it('estado Resuelto badge has success tone (bg-emerald-500/10)', () => {
    render(<ReparacionesList reparaciones={[mockReparaciones[1]]} />)
    const badge = screen.getByText('Resuelto').closest('span')
    expect(badge?.className).toContain('bg-emerald-500/10')
  })

  // ─── Empty ─────────────────────────────────────────────────────────────────

  it('renders empty list when reparaciones array is empty', () => {
    render(<ReparacionesList reparaciones={[]} />)
    expect(screen.queryByText('Cambio de vidrio roto en oficina 3')).not.toBeInTheDocument()
  })
})
