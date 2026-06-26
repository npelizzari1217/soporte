import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Label } from './label'

describe('Label', () => {
  it('renders with text-xs class', () => {
    render(<Label data-testid="lbl">Campo</Label>)
    expect(screen.getByTestId('lbl').className).toContain('text-xs')
  })

  it('renders with tracking-wider class', () => {
    render(<Label data-testid="lbl">Campo</Label>)
    expect(screen.getByTestId('lbl').className).toContain('tracking-wider')
  })

  it('renders with uppercase class', () => {
    render(<Label data-testid="lbl">Campo</Label>)
    expect(screen.getByTestId('lbl').className).toContain('uppercase')
  })

  it('forwards htmlFor to the for attribute on the DOM element', () => {
    render(<Label htmlFor="email">Email</Label>)
    expect(screen.getByText('Email')).toHaveAttribute('for', 'email')
  })

  it('renders children', () => {
    render(<Label>Nombre completo</Label>)
    expect(screen.getByText('Nombre completo')).toBeInTheDocument()
  })

  it('accepts and merges extra className', () => {
    render(<Label className="mt-2" data-testid="lbl">Campo</Label>)
    const el = screen.getByTestId('lbl')
    expect(el.className).toContain('mt-2')
    // also keeps base classes
    expect(el.className).toContain('uppercase')
  })
})
