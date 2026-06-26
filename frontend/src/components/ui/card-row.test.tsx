/**
 * CardRow unit tests (RTL — strict TDD RED → GREEN).
 *
 * CardRow is a shared presentational "row-as-card" primitive used across
 * Tickets, Compras, Reparaciones and Equipos lists (CONSTITUTION §2 scope rule:
 * shared across 4 features → promoted to @/components/ui).
 *
 * Spec: [SPEC:frontend-design-system/req-8-filas-tarjeta]
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CardRow } from './card-row'

describe('CardRow', () => {
  // ─── Slots ────────────────────────────────────────────────────────────────────

  it('renders icon when provided', () => {
    render(<CardRow title="Test" icon={<span data-testid="test-icon">I</span>} />)
    expect(screen.getByTestId('test-icon')).toBeInTheDocument()
  })

  it('renders title as visible text', () => {
    render(<CardRow title="My Title" />)
    expect(screen.getByText('My Title')).toBeInTheDocument()
  })

  it('renders subtitle when provided', () => {
    render(<CardRow title="Title" subtitle="My subtitle" />)
    expect(screen.getByText('My subtitle')).toBeInTheDocument()
  })

  it('does not render subtitle slot when omitted', () => {
    render(<CardRow title="Title" />)
    expect(screen.queryByText('My subtitle')).not.toBeInTheDocument()
  })

  it('renders badges slot when provided', () => {
    render(
      <CardRow
        title="Title"
        badges={<span data-testid="test-badge">Badge</span>}
      />
    )
    expect(screen.getByTestId('test-badge')).toBeInTheDocument()
  })

  // ─── Interactivity ────────────────────────────────────────────────────────────

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn()
    render(<CardRow title="Clickable" onClick={handleClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledOnce()
  })

  it('has no role="button" when onClick is not provided', () => {
    render(<CardRow title="Static row" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('has role="button" and tabIndex=0 when onClick is provided', () => {
    render(<CardRow title="Clickable" onClick={() => {}} />)
    const el = screen.getByRole('button')
    expect(el).toBeInTheDocument()
    expect(el).toHaveAttribute('tabindex', '0')
  })

  it('calls onClick when Enter key is pressed on interactive row', () => {
    const handleClick = vi.fn()
    render(<CardRow title="Keyboard" onClick={handleClick} />)
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' })
    expect(handleClick).toHaveBeenCalledOnce()
  })

  it('calls onClick when Space key is pressed on interactive row', () => {
    const handleClick = vi.fn()
    render(<CardRow title="Keyboard" onClick={handleClick} />)
    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' })
    expect(handleClick).toHaveBeenCalledOnce()
  })

  // ─── Styling ──────────────────────────────────────────────────────────────────

  it('has class rounded-lg on the wrapper element', () => {
    const { container } = render(<CardRow title="Test" />)
    expect(container.firstChild).toHaveClass('rounded-lg')
  })
})
