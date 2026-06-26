import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Input atom — premium form input.
 *
 * Why rounded-xl: CONSTITUTION §3 mandates `rounded-xl` (12px) for all form
 * inputs, distinct from the `rounded-md` used by buttons and dropdowns.
 *
 * The `error` prop triggers a destructive ring variant instead of the default
 * focus ring, giving immediate visual feedback without requiring external
 * wrapper logic.
 */
const inputVariants = cva(
  'flex w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm ring-offset-background ' +
  'placeholder:text-muted-foreground ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  'transition-colors',
  {
    variants: {
      error: {
        true:  'border-destructive focus-visible:ring-destructive/30',
        false: '',
      },
    },
    defaultVariants: {
      error: false,
    },
  }
)

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    Omit<VariantProps<typeof inputVariants>, 'error'> {
  /** When true, applies destructive border + ring to signal a validation error. */
  error?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error = false, ...props }, ref) => {
    return (
      <input
        className={cn(inputVariants({ error, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input, inputVariants }
