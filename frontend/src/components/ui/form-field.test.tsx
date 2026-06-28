import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { FormField } from './form-field'
import { Input } from './input'

describe('FormField', () => {
  it('renders a label associated to the control via htmlFor', () => {
    render(
      <FormField label="Título" htmlFor="titulo">
        <Input id="titulo" />
      </FormField>
    )
    const label = screen.getByText('Título')
    expect(label.tagName).toBe('LABEL')
    expect(label).toHaveAttribute('for', 'titulo')
  })

  it('label has text-xs tracking-wider uppercase text-muted-foreground classes', () => {
    render(
      <FormField label="Título" htmlFor="titulo">
        <Input id="titulo" />
      </FormField>
    )
    const label = screen.getByText('Título')
    expect(label.className).toContain('text-xs')
    expect(label.className).toContain('tracking-wider')
    expect(label.className).toContain('uppercase')
    expect(label.className).toContain('text-muted-foreground')
  })

  it('does NOT render role="alert" when error is absent', () => {
    render(
      <FormField label="Título" htmlFor="titulo">
        <Input id="titulo" />
      </FormField>
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders error message with role="alert" and text-destructive when error is provided', () => {
    render(
      <FormField label="Título" htmlFor="titulo" error="El título es requerido">
        <Input id="titulo" />
      </FormField>
    )
    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent('El título es requerido')
    expect(alert.className).toContain('text-destructive')
  })

  it('shows required indicator "*" in label when required=true', () => {
    render(
      <FormField label="Título" htmlFor="titulo" required>
        <Input id="titulo" />
      </FormField>
    )
    // The label element should contain "*" somewhere
    const labelEl = screen.getByText(/Título/)
    expect(labelEl.textContent).toContain('*')
  })

  it('accepts Input as children without React errors', () => {
    expect(() =>
      render(
        <FormField label="Nombre">
          <Input id="nombre" />
        </FormField>
      )
    ).not.toThrow()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('accepts bare textarea as children without React errors', () => {
    expect(() =>
      render(
        <FormField label="Descripción">
          <textarea id="desc" />
        </FormField>
      )
    ).not.toThrow()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('is importable as named export from @/components/ui/form-field', async () => {
    const mod = await import('@/components/ui/form-field')
    expect(mod.FormField).toBeDefined()
    expect(typeof mod.FormField).toBe('function')
  })
})
