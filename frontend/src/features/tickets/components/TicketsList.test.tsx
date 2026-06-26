/**
 * TicketsList unit tests (S5a — CardRow migration).
 *
 * Verifies that TicketsList renders as card rows (NOT a <table>) and that
 * badge tones match the ESTADO_TONE / PRIORIDAD_TONE maps from catalogos.ts.
 *
 * Atomicity contract: local fixtures only, no network, no MSW.
 * Integration tests (TicketsPage.test.tsx) cover the full connected behavior.
 *
 * Spec: [SPEC:frontend-design-system/req-8-filas-tarjeta]
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TicketsList } from './TicketsList'
import type { Ticket } from '../types'

// ─── Fixtures ────────────────────────────────────────────────────────────────

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
    fechaVencimiento: null,
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
    fechaVencimiento: null,
    createdAt: '2026-01-14T09:00:00Z',
    updatedAt: '2026-01-14T09:00:00Z',
  },
]

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TicketsList', () => {
  // ─── Layout: no table ──────────────────────────────────────────────────────

  it('renders NO <table> element (migrated to card rows)', () => {
    render(<TicketsList tickets={mockTickets} />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders NO <tr> elements', () => {
    const { container } = render(<TicketsList tickets={mockTickets} />)
    expect(container.querySelector('tr')).toBeNull()
  })

  // ─── Content ───────────────────────────────────────────────────────────────

  it('renders each ticket title as visible text', () => {
    render(<TicketsList tickets={mockTickets} />)
    expect(screen.getByText('Problema con impresora')).toBeInTheDocument()
    expect(screen.getByText('Falla en red local')).toBeInTheDocument()
  })

  it('renders the correct number of card rows', () => {
    render(<TicketsList tickets={mockTickets} />)
    // Each ticket should render as a list item (li) or a card div
    // Count any element that renders the ticket titulo
    const titles = screen.getAllByText(/Problema con impresora|Falla en red local/)
    expect(titles).toHaveLength(2)
  })

  // ─── Badge tones ───────────────────────────────────────────────────────────

  it('estado Pendiente de aprobación badge has warning tone (bg-amber-500/10)', () => {
    render(<TicketsList tickets={[mockTickets[0]]} />)
    const badge = screen.getByText('Pendiente de aprobación').closest('span')
    expect(badge?.className).toContain('bg-amber-500/10')
  })

  it('estado En progreso badge has info tone (bg-blue-500/10)', () => {
    render(<TicketsList tickets={[mockTickets[1]]} />)
    const badge = screen.getByText('En progreso').closest('span')
    expect(badge?.className).toContain('bg-blue-500/10')
  })

  it('prioridad Crítica badge has danger tone (bg-red-500/10)', () => {
    render(<TicketsList tickets={[mockTickets[0]]} />)
    const badge = screen.getByText('Crítica').closest('span')
    expect(badge?.className).toContain('bg-red-500/10')
  })

  it('prioridad Media badge has info tone (bg-blue-500/10)', () => {
    render(<TicketsList tickets={[mockTickets[1]]} />)
    const badge = screen.getByText('Media').closest('span')
    expect(badge?.className).toContain('bg-blue-500/10')
  })

  // ─── Empty ─────────────────────────────────────────────────────────────────

  it('renders empty list when tickets array is empty', () => {
    const { container } = render(<TicketsList tickets={[]} />)
    // No titles, no rows
    expect(screen.queryByText('Problema con impresora')).not.toBeInTheDocument()
    expect(container.querySelectorAll('[role="listitem"]').length).toBe(0)
  })
})
