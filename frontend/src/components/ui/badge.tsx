import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { type BadgeTone, BADGE_TONE_CLASSES } from '@/shared/lib/badge-tones'

/**
 * Badge atom — semantic status indicator.
 *
 * Why rounded-md NOT rounded-full: CONSTITUTION §3 explicitly mandates
 * "Badges `rounded-md` (no pill)" for the super-premium aesthetic.
 * Pill shapes are generic; squared-corner chips look more refined.
 *
 * The `tone` variants are sourced from BADGE_TONE_CLASSES (shared/lib) so
 * any future palette change updates all consumers at once.
 */
const badgeVariants = cva(
  'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      tone: {
        neutral: BADGE_TONE_CLASSES.neutral,
        warning: BADGE_TONE_CLASSES.warning,
        success: BADGE_TONE_CLASSES.success,
        danger:  BADGE_TONE_CLASSES.danger,
        info:    BADGE_TONE_CLASSES.info,
      } satisfies Record<BadgeTone, string>,
    },
    defaultVariants: {
      tone: 'neutral',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  tone?: BadgeTone
}

function Badge({ tone, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ tone }), className)}
      {...props}
    >
      {children}
    </span>
  )
}
Badge.displayName = 'Badge'

export { Badge, badgeVariants }
