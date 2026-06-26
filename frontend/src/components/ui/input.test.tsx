import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Input } from './input'

describe('Input', () => {
  it('renders with rounded-xl class', () => {
    render(<Input data-testid="inp" />)
    expect(screen.getByTestId('inp').className).toContain('rounded-xl')
  })

  it('forwards placeholder prop to the native input', () => {
    render(<Input placeholder="Escribí aquí" />)
    expect(screen.getByPlaceholderText('Escribí aquí')).toBeInTheDocument()
  })

  it('forwards disabled prop to the native input', () => {
    render(<Input data-testid="inp" disabled />)
    expect(screen.getByTestId('inp')).toBeDisabled()
  })

  it('applies error classes when error=true', () => {
    render(<Input data-testid="inp" error />)
    const el = screen.getByTestId('inp')
    expect(el.className).toContain('border-destructive')
  })

  it('does not apply error classes when error is absent', () => {
    render(<Input data-testid="inp" />)
    const el = screen.getByTestId('inp')
    expect(el.className).not.toContain('border-destructive')
  })

  it('forwards ref to the underlying <input> DOM node', () => {
    const ref = React.createRef<HTMLInputElement>()
    render(<Input ref={ref} />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })
})
