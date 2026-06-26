import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * CardRow — shared "row-as-card" primitive (CONSTITUTION §3 filas-tarjeta).
 *
 * Replaces dense `<table>` layouts with individually spaced cards that follow
 * the super-premium aesthetic: glassmorphism border, icon slot left,
 * hierarchical text center, badges right.
 *
 * Scope: used across Tickets, Compras, Reparaciones, and Equipos (4 features)
 * → promoted to @/components/ui per CONSTITUTION §2 scope rule.
 *
 * Why conditional role="button": ARIA spec prohibits role="button" on elements
 * that lack interactive affordance. Static list rows must NOT announce as
 * buttons — doing so confuses screen readers with phantom affordances. The
 * role and keyboard handlers are added only when `onClick` is provided.
 *
 * Spec: [SPEC:frontend-design-system/req-8-filas-tarjeta]
 */

export interface CardRowProps {
  /** Icon slot rendered in the left circle (Lucide icon or any ReactNode). */
  icon?: React.ReactNode
  /** Primary text — domain entity title. */
  title: React.ReactNode
  /** Secondary text — metadata (numero, date, category). */
  subtitle?: React.ReactNode
  /** Badge(s) or status chips rendered on the right. */
  badges?: React.ReactNode
  /**
   * When provided, the entire row becomes interactive.
   * Adds role="button", tabIndex=0, and Enter/Space keyboard handlers.
   */
  onClick?: () => void
  className?: string
}

export function CardRow({
  icon,
  title,
  subtitle,
  badges,
  onClick,
  className,
}: CardRowProps) {
  const isInteractive = Boolean(onClick)

  /** Enter/Space trigger so keyboard users get the same affordance as mouse users. */
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick?.()
    }
  }

  return (
    <div
      className={cn(
        'flex items-center gap-4 p-4 rounded-lg border bg-card backdrop-blur-sm',
        // Glassmorphism border: ultra-thin in both modes (CONSTITUTION §3)
        'border-slate-200/50 dark:border-white/5',
        'transition-colors duration-200',
        isInteractive && 'cursor-pointer hover:bg-muted/50',
        className,
      )}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={isInteractive ? onClick : undefined}
      onKeyDown={isInteractive ? handleKeyDown : undefined}
    >
      {/* Left: icon slot */}
      {icon !== undefined && (
        <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center text-muted-foreground">
          {icon}
        </div>
      )}

      {/* Center: title + subtitle */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{title}</div>
        {subtitle !== undefined && (
          <div className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</div>
        )}
      </div>

      {/* Right: badges slot */}
      {badges !== undefined && (
        <div className="flex items-center gap-2 flex-shrink-0">{badges}</div>
      )}
    </div>
  )
}
