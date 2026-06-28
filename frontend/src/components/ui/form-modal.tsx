'use client'

import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * FormModal — shell de diálogo glassmorphism sobre @radix-ui/react-dialog.
 *
 * ADR-2: Dialog permite ESC + click-outside (correcto para forms).
 * El footer lo provee el consumer (<form> del consumidor) para que
 * type="submit" funcione dentro del mismo contexto rhf.
 *
 * Glassmorphism (CONSTITUTION §3):
 *   Overlay: bg-slate-950/60 backdrop-blur-sm
 *   Content: bg-card/95 backdrop-blur border-white/10 rounded-xl
 *
 * Design: §1.3 FormModal contract.
 */

export interface FormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

function FormModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: FormModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        />
        <Dialog.Content
          aria-modal="true"
          className={cn(
            'fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%]',
            'rounded-xl border border-white/10',
            'bg-card/95 backdrop-blur shadow-2xl',
            'max-h-[85vh] flex flex-col',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-left-1/2 data-[state=open]:slide-in-from-left-1/2',
            className
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
            <Dialog.Title className="text-base font-semibold">
              {title}
            </Dialog.Title>
            {description && (
              <Dialog.Description className="sr-only">
                {description}
              </Dialog.Description>
            )}
            <Dialog.Close
              className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" aria-hidden />
            </Dialog.Close>
          </div>

          {/* Body — scrollable */}
          <div className="overflow-y-auto flex-1 px-6 py-4">
            {children}
          </div>

          {/* Footer — optional, provided by consumer */}
          {footer && (
            <>
              <div className="border-t border-white/10" />
              <div className="flex items-center justify-end gap-2 px-6 py-4 shrink-0">
                {footer}
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
FormModal.displayName = 'FormModal'

export { FormModal }
