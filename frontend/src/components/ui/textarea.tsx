import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Textarea atom — premium multiline input.
 *
 * Mirrors <Input> in structure: rounded-xl (CONSTITUTION §3 — inputs),
 * forwardRef for react-hook-form register(), error prop for destructive
 * border feedback.
 */

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** When true, applies destructive border to signal a validation error. */
  error?: boolean
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error = false, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'transition-colors resize-none',
          error && 'border-destructive focus-visible:ring-destructive/30',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'

export { Textarea }
