'use client'

import * as React from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/**
 * ConfirmDialog — diálogo de confirmación destructiva sobre @radix-ui/react-alert-dialog.
 *
 * ADR-2: AlertDialog NO cierra por ESC ni click-outside (semántica destructiva:
 * fuerza decisión explícita). El caller controla `open` — ConfirmDialog NO
 * llama a onOpenChange(false) en el Action (e.preventDefault() previene el
 * cierre automático de Radix).
 *
 * Design: §1.4 ConfirmDialog contract.
 */

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'default'
  isPending?: boolean
  onConfirm: () => void
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  isPending = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        />
        <AlertDialog.Content
          onEscapeKeyDown={(e) => e.preventDefault()}
          className={cn(
            'fixed left-[50%] top-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%]',
            'rounded-xl border border-white/10',
            'bg-card/95 backdrop-blur shadow-2xl',
            'p-6 flex flex-col gap-4',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
          )}
        >
          <AlertDialog.Title className="text-base font-semibold">
            {title}
          </AlertDialog.Title>

          {description && (
            <AlertDialog.Description className="text-sm text-muted-foreground">
              {description}
            </AlertDialog.Description>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            {/* Cancel — uses Radix AlertDialog.Cancel which calls onOpenChange(false) */}
            <AlertDialog.Cancel asChild>
              <Button variant="outline">
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>

            {/*
             * Action — e.preventDefault() evita el cierre automático de Radix.
             * El caller controla open a través de su lógica post-confirmación.
             * Design §1.4: "el caller controla open".
             */}
            <AlertDialog.Action asChild>
              <Button
                variant="destructive"
                isLoading={isPending}
                onClick={(e) => {
                  e.preventDefault()
                  onConfirm()
                }}
              >
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
ConfirmDialog.displayName = 'ConfirmDialog'

export { ConfirmDialog }
