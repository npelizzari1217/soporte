import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { ConfirmDialog } from './confirm-dialog'

describe('ConfirmDialog', () => {
  it('is importable as named export from @/components/ui/confirm-dialog', async () => {
    const mod = await import('@/components/ui/confirm-dialog')
    expect(mod.ConfirmDialog).toBeDefined()
  })

  it('renders role="alertdialog" with title and description when open=true', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        title="¿Eliminar ticket?"
        description="Esta acción no se puede deshacer."
      />
    )
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('¿Eliminar ticket?')).toBeInTheDocument()
    expect(screen.getByText('Esta acción no se puede deshacer.')).toBeInTheDocument()
  })

  it('does NOT call onOpenChange when ESC is pressed (AlertDialog behavior)', () => {
    const onOpenChange = vi.fn()
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        onConfirm={vi.fn()}
        title="¿Eliminar?"
      />
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('does NOT call onOpenChange when overlay is clicked (AlertDialog behavior)', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        onConfirm={vi.fn()}
        title="¿Eliminar?"
      />
    )
    // AlertDialog does not close on overlay click — just verify onOpenChange not called with false
    fireEvent.pointerDown(document.body)
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    void user // suppress unused warning
  })

  it('confirm button is disabled and shows loading state when isPending=true', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        title="¿Eliminar?"
        isPending={true}
      />
    )
    const confirmBtn = screen.getByRole('button', { name: /Eliminar|Confirmar/i })
    expect(confirmBtn).toBeDisabled()
  })

  it('calls onOpenChange(false) when Cancel button is clicked and does NOT call onConfirm', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        title="¿Eliminar?"
      />
    )
    await user.click(screen.getByRole('button', { name: /Cancelar/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('calls onConfirm exactly once when confirm button is clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        title="¿Eliminar?"
      />
    )
    await user.click(screen.getByRole('button', { name: /Eliminar|Confirmar/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('dialog does NOT auto-close after confirm (caller controls open)', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        title="¿Eliminar?"
      />
    )
    await user.click(screen.getByRole('button', { name: /Eliminar|Confirmar/i }))
    // onOpenChange should NOT be called automatically by the dialog itself
    expect(onOpenChange).not.toHaveBeenCalled()
    // dialog still in DOM (since open=true hasn't changed)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('shows default confirmLabel "Eliminar" when not provided', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        title="¿Eliminar?"
      />
    )
    expect(screen.getByRole('button', { name: /Eliminar/i })).toBeInTheDocument()
  })

  it('shows default cancelLabel "Cancelar" when not provided', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        title="¿Eliminar?"
      />
    )
    expect(screen.getByRole('button', { name: /Cancelar/i })).toBeInTheDocument()
  })

  it('confirm button uses destructive variant (has bg-destructive or related class)', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        title="¿Eliminar?"
      />
    )
    const confirmBtn = screen.getByRole('button', { name: /Eliminar|Confirmar/i })
    // Button atom with variant="destructive" adds bg-destructive class
    expect(confirmBtn.className).toContain('destructive')
  })

  it('confirm button has rounded-md class (constitution §3 — buttons)', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        title="¿Eliminar?"
      />
    )
    const confirmBtn = screen.getByRole('button', { name: /Eliminar|Confirmar/i })
    expect(confirmBtn.className).toContain('rounded-md')
  })
})
