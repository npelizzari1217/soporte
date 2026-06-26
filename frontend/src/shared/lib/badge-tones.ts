/**
 * Badge tone palette — canonical definition for the project.
 *
 * Why here: BadgeTone is shared by Badge component, catalogos.ts, and list
 * components (S5a/S5b). Per scope rule in CONSTITUTION §2, any constant used
 * in 2+ features is promoted to shared/lib immediately.
 *
 * Translucent backgrounds (10% opacity via Tailwind /10 modifier) pair with semantic text colors that
 * flip between light/dark modes, matching the dual-token strategy from S1.
 */

export type BadgeTone = 'neutral' | 'warning' | 'success' | 'danger' | 'info'

export const BADGE_TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  danger:  'bg-red-500/10 text-red-600 dark:text-red-400',
  info:    'bg-blue-500/10 text-blue-600 dark:text-blue-400',
}
