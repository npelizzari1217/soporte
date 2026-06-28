import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Textarea } from './textarea'

describe('Textarea', () => {
  it('renders a textarea element', () => {
    render(<Textarea data-testid="ta" />)
    expect(screen.getByTestId('ta').tagName).toBe('TEXTAREA')
  })

  it('forwardRef works — ref points to HTMLTextAreaElement', () => {
    const ref = React.createRef<HTMLTextAreaElement>()
    render(<Textarea ref={ref} />)
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement)
  })

  it('has rounded-xl as base class', () => {
    render(<Textarea data-testid="ta" />)
    expect(screen.getByTestId('ta').className).toContain('rounded-xl')
  })

  it('applies border-destructive when error=true', () => {
    render(<Textarea data-testid="ta" error />)
    expect(screen.getByTestId('ta').className).toContain('border-destructive')
  })

  it('does NOT apply border-destructive when error=false', () => {
    render(<Textarea data-testid="ta" error={false} />)
    expect(screen.getByTestId('ta').className).not.toContain('border-destructive')
  })

  it('does NOT apply border-destructive when error is absent', () => {
    render(<Textarea data-testid="ta" />)
    expect(screen.getByTestId('ta').className).not.toContain('border-destructive')
  })

  it('forwards placeholder prop', () => {
    render(<Textarea placeholder="Escribí aquí" />)
    expect(screen.getByPlaceholderText('Escribí aquí')).toBeInTheDocument()
  })

  it('forwards disabled prop', () => {
    render(<Textarea data-testid="ta" disabled />)
    expect(screen.getByTestId('ta')).toBeDisabled()
  })

  it('forwards rows prop', () => {
    render(<Textarea data-testid="ta" rows={5} />)
    expect(screen.getByTestId('ta')).toHaveAttribute('rows', '5')
  })

  it('merges className prop', () => {
    render(<Textarea data-testid="ta" className="custom-class" />)
    expect(screen.getByTestId('ta').className).toContain('custom-class')
  })
})
