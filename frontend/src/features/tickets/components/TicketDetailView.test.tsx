/**
 * TicketDetailView unit tests — presentational print-root component.
 *
 * Pure component: receives `ticket` by prop, no fetch, no hooks with providers
 * required. Covers spec [SPEC:ticket-detail/renderizado-de-datos-del-ticket]
 * and the structural print-root scenario
 * [SPEC:ticket-detail/aislamiento-estructural-de-la-vista-de-impresion].
 *
 * Design: design.md §"Estructura Container/Presentational" (TicketDetailView),
 * ADR-1 (`data-ticket-print` whitelist marker).
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TicketDetailView } from './TicketDetailView'
import type { Ticket } from '../types'

const ESTADO_PENDIENTE = 'c0000000-0000-4000-c000-000000000002' // Pendiente de aprobación → warning
const PRIORIDAD_CRITICA = 'd0000000-0000-4000-d000-000000000004' // Crítica → danger
const TIPO_SOPORTE = 'e0000000-0000-4000-e000-000000000001' // Soporte

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'ticket-1',
    numero: 'SOP-2026-00001',
    titulo: 'Problema con impresora',
    descripcion: 'La impresora del 2do piso no enciende.',
    tipoId: TIPO_SOPORTE,
    estadoId: ESTADO_PENDIENTE,
    prioridadId: PRIORIDAD_CRITICA,
    cicloId: null,
    solicitanteId: 'user-1',
    asignadoId: null,
    fechaCierre: null,
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-01-16T10:00:00Z',
    ...overrides,
  }
}

describe('TicketDetailView', () => {
  it('renderiza numero, titulo, descripcion y fecha de creación es-AR', () => {
    render(<TicketDetailView ticket={makeTicket()} />)

    expect(screen.getByText('SOP-2026-00001')).toBeInTheDocument()
    expect(screen.getByText('Problema con impresora')).toBeInTheDocument()
    expect(screen.getByText('La impresora del 2do piso no enciende.')).toBeInTheDocument()
    expect(screen.getByText('15/01/2026')).toBeInTheDocument()
  })

  it('renderiza el badge de estado con el label y tone del catálogo', () => {
    render(<TicketDetailView ticket={makeTicket({ estadoId: ESTADO_PENDIENTE })} />)

    const badge = screen.getByText('Pendiente de aprobación')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass('bg-amber-500/10')
  })

  it('muestra "Sin descripción" cuando descripcion es null', () => {
    render(<TicketDetailView ticket={makeTicket({ descripcion: null })} />)

    expect(screen.getByText('Sin descripción')).toBeInTheDocument()
  })

  it('no renderiza fechaCierre cuando es null', () => {
    render(<TicketDetailView ticket={makeTicket({ fechaCierre: null })} />)

    expect(screen.queryByText('Cierre')).not.toBeInTheDocument()
  })

  it('renderiza fechaCierre es-AR cuando no es null', () => {
    render(<TicketDetailView ticket={makeTicket({ fechaCierre: '2026-01-20T12:00:00Z' })} />)

    expect(screen.getByText('Cierre')).toBeInTheDocument()
    expect(screen.getByText('20/01/2026')).toBeInTheDocument()
  })

  it('expone un único nodo [data-ticket-print] que envuelve el reporte', () => {
    const { container } = render(<TicketDetailView ticket={makeTicket()} />)

    const printRoots = container.querySelectorAll('[data-ticket-print]')
    expect(printRoots).toHaveLength(1)
    expect(printRoots[0]).toContainElement(screen.getByText('Problema con impresora'))
  })
})
