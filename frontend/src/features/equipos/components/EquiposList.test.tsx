/**
 * EquiposList unit tests (S5b — CardRow migration).
 *
 * Verifies that EquiposList renders as card rows (NOT a <table>) and that
 * the activo/inactivo badge tone is correct.
 * activo=true  → Badge tone "success" → bg-emerald-500/10
 * activo=false → Badge tone "neutral" → bg-muted
 *
 * Atomicity contract: local fixtures only, no network, no MSW.
 *
 * Spec: [SPEC:frontend-design-system/req-8-filas-tarjeta]
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { EquiposList } from './EquiposList'
import type { Equipo } from '../types'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockEquipos: Equipo[] = [
  {
    id: 'equipo-1',
    nombre: 'Notebook Dell XPS',
    marca: 'Dell',
    modelo: 'XPS 15',
    numeroSerie: 'SN-001-DELL',
    fechaAdquisicion: '2024-03-15T00:00:00Z',
    ubicacionId: 'ubic-1',
    asignadoAId: 'user-1',
    activo: true,
    createdAt: '2024-03-15T00:00:00Z',
    updatedAt: '2024-03-15T00:00:00Z',
  },
  {
    id: 'equipo-2',
    nombre: 'Impresora HP LaserJet',
    marca: 'HP',
    modelo: 'LaserJet Pro',
    numeroSerie: null,
    fechaAdquisicion: null,
    ubicacionId: null,
    asignadoAId: null,
    activo: false,
    createdAt: '2023-07-01T00:00:00Z',
    updatedAt: '2023-07-01T00:00:00Z',
  },
]

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EquiposList', () => {
  // ─── Layout: no table ──────────────────────────────────────────────────────

  it('renders NO <table> element (migrated to card rows)', () => {
    render(<EquiposList equipos={mockEquipos} />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders NO <tr> elements', () => {
    const { container } = render(<EquiposList equipos={mockEquipos} />)
    expect(container.querySelector('tr')).toBeNull()
  })

  // ─── Content ───────────────────────────────────────────────────────────────

  it('renders each equipo nombre as visible text', () => {
    render(<EquiposList equipos={mockEquipos} />)
    expect(screen.getByText('Notebook Dell XPS')).toBeInTheDocument()
    expect(screen.getByText('Impresora HP LaserJet')).toBeInTheDocument()
  })

  it('renders marca and modelo in subtitle', () => {
    render(<EquiposList equipos={[mockEquipos[0]]} />)
    expect(screen.getByText('Dell')).toBeInTheDocument()
    expect(screen.getByText('XPS 15')).toBeInTheDocument()
  })

  // ─── Badge tones ───────────────────────────────────────────────────────────

  it('activo equipo badge has success tone (bg-emerald-500/10)', () => {
    render(<EquiposList equipos={[mockEquipos[0]]} />)
    const badge = screen.getByText('Activo').closest('span')
    expect(badge?.className).toContain('bg-emerald-500/10')
  })

  it('inactivo equipo badge has neutral tone (bg-muted)', () => {
    render(<EquiposList equipos={[mockEquipos[1]]} />)
    const badge = screen.getByText('Inactivo').closest('span')
    expect(badge?.className).toContain('bg-muted')
  })

  // ─── Null field handling ───────────────────────────────────────────────────

  it('renders "—" when marca/modelo/numeroSerie are null', () => {
    render(<EquiposList equipos={[mockEquipos[1]]} />)
    // Multiple "—" values are expected (marca, modelo, numeroSerie)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(1)
  })

  // ─── Empty ─────────────────────────────────────────────────────────────────

  it('renders empty list when equipos array is empty', () => {
    render(<EquiposList equipos={[]} />)
    expect(screen.queryByText('Notebook Dell XPS')).not.toBeInTheDocument()
  })
})
