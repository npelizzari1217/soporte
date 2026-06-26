import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Badge } from './badge'

describe('Badge', () => {
  it('tone="warning" applies bg-amber-500/10 class', () => {
    render(<Badge tone="warning" data-testid="b">Pendiente</Badge>)
    expect(screen.getByTestId('b').className).toContain('bg-amber-500/10')
  })

  it('tone="success" applies bg-emerald-500/10 class', () => {
    render(<Badge tone="success" data-testid="b">Aprobado</Badge>)
    expect(screen.getByTestId('b').className).toContain('bg-emerald-500/10')
  })

  it('tone="danger" applies bg-red-500/10 class', () => {
    render(<Badge tone="danger" data-testid="b">Rechazado</Badge>)
    expect(screen.getByTestId('b').className).toContain('bg-red-500/10')
  })

  it('tone="info" applies bg-blue-500/10 class', () => {
    render(<Badge tone="info" data-testid="b">En progreso</Badge>)
    expect(screen.getByTestId('b').className).toContain('bg-blue-500/10')
  })

  it('tone="neutral" applies bg-muted class', () => {
    render(<Badge tone="neutral" data-testid="b">Abierto</Badge>)
    expect(screen.getByTestId('b').className).toContain('bg-muted')
  })

  it('all tones use rounded-md (not rounded-full)', () => {
    const tones = ['neutral', 'warning', 'success', 'danger', 'info'] as const
    tones.forEach((tone) => {
      const { getByTestId, unmount } = render(
        <Badge tone={tone} data-testid="b">{tone}</Badge>
      )
      expect(getByTestId('b').className).toContain('rounded-md')
      expect(getByTestId('b').className).not.toContain('rounded-full')
      unmount()
    })
  })

  it('renders children inside the badge', () => {
    render(<Badge tone="info">En progreso</Badge>)
    expect(screen.getByText('En progreso')).toBeInTheDocument()
  })

  it('defaults to neutral tone when tone prop is omitted', () => {
    render(<Badge data-testid="b">Sin tono</Badge>)
    expect(screen.getByTestId('b').className).toContain('bg-muted')
  })
})
