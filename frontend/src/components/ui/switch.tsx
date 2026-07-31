import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Switch atom — toggle boolean premium (track + thumb), sin dependencia Radix.
 *
 * Por qué nativo y no @radix-ui/react-switch: el paquete NO está instalado en
 * este repo (solo react-alert-dialog/dialog/dropdown-menu/select/slot —
 * verificado en package.json/node_modules antes de codear). Sumar una
 * dependencia nueva para un control accesible simple (`role="switch"` +
 * `aria-checked` + manejo de teclado nativo del `<button>`) es superficie
 * evitable; se sigue el mismo criterio de `ui-patterns` (Switch para boolean)
 * sin acoplarse a Radix para este átomo puntual.
 *
 * Fully controlled (como los demás átomos del repo): el consumer maneja el
 * estado (`checked` + `onCheckedChange`), este componente NO tiene estado propio.
 *
 * Radio: `rounded-full` (pill) — deliberadamente distinto de inputs
 * (`rounded-xl`) y de badges/dropdowns (`rounded-md`); es el radio estándar
 * de un toggle de dos estados, no cubierto por la regla de CONSTITUTION §3
 * de "contenedores/formularios".
 */
export interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  className?: string
  'aria-label'?: string
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    { checked, onCheckedChange, disabled = false, id, className, 'aria-label': ariaLabel },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent',
          'transition-colors duration-300 ease-in-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-primary' : 'bg-input',
          className,
        )}
      >
        <span
          aria-hidden
          className={cn(
            'pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0',
            'transition-transform duration-300 ease-in-out',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
    )
  },
)
Switch.displayName = 'Switch'

export { Switch }
