import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Label atom — form field label.
 *
 * Why uppercase + tracking-wider: CONSTITUTION §3 mandates labels be
 * "uppercase compactas, espaciadas y atenuadas" (text-xs tracking-wider
 * uppercase). This distinguishes field labels visually from body text and
 * aligns with the Super Premium aesthetic.
 */
const labelVariants = cva(
  'text-xs font-medium tracking-wider uppercase text-muted-foreground'
)

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement> &
  VariantProps<typeof labelVariants>

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => {
    return (
      <label
        className={cn(labelVariants(), className)}
        ref={ref}
        {...props}
      />
    )
  }
)
Label.displayName = 'Label'

export { Label, labelVariants }
