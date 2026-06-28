import * as React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Select } from './select'

const OPTIONS = [
  { value: 'uno', label: 'Uno' },
  { value: 'dos', label: 'Dos' },
  { value: 'tres', label: 'Tres' },
]

describe('Select', () => {
  it('trigger has rounded-xl class', () => {
    render(<Select options={OPTIONS} placeholder="Elegí uno" />)
    const trigger = screen.getByRole('combobox')
    expect(trigger.className).toContain('rounded-xl')
  })

  it('renders placeholder when no value is set', () => {
    render(<Select options={OPTIONS} placeholder="Elegí uno" />)
    expect(screen.getByText('Elegí uno')).toBeInTheDocument()
  })

  it('opens the listbox when trigger is clicked', async () => {
    const user = userEvent.setup()
    render(<Select options={OPTIONS} placeholder="Elegí" />)
    const trigger = screen.getByRole('combobox')
    await user.click(trigger)
    // Radix renders the listbox via a portal into document.body
    const body = within(document.body)
    expect(body.getByRole('listbox')).toBeInTheDocument()
  })

  it('calls onValueChange with the correct value when an item is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Select options={OPTIONS} placeholder="Elegí" onValueChange={onChange} />)
    await user.click(screen.getByRole('combobox'))
    const body = within(document.body)
    await user.click(body.getByRole('option', { name: 'Dos' }))
    expect(onChange).toHaveBeenCalledWith('dos')
  })

  it('panel container has rounded-md class', async () => {
    const user = userEvent.setup()
    render(<Select options={OPTIONS} placeholder="Elegí" />)
    await user.click(screen.getByRole('combobox'))
    const body = within(document.body)
    const listbox = body.getByRole('listbox')
    // The content wrapper is a parent of the listbox; it should carry rounded-md
    expect(listbox.className).toContain('rounded-md')
  })

  it('trigger is disabled when disabled prop is true', () => {
    render(<Select options={OPTIONS} disabled />)
    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  // T1.8 — error prop
  it('trigger has border-destructive class when error=true', () => {
    render(<Select options={OPTIONS} error={true} />)
    expect(screen.getByRole('combobox').className).toContain('border-destructive')
  })

  it('trigger does NOT have border-destructive when error=false', () => {
    render(<Select options={OPTIONS} error={false} />)
    expect(screen.getByRole('combobox').className).not.toContain('border-destructive')
  })
})
