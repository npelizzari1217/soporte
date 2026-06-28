import * as React from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * FormField — wrapper presentacional de campo de formulario.
 *
 * Combina Label (uppercase, tracking, muted) + control hijo + mensaje de error
 * accesible. Genérico: no conoce react-hook-form internamente. El consumer
 * pasa el string de error (errors.campo?.message) y el control (Input/Select/Textarea).
 *
 * CONSTITUTION §3: labels superiores en mayúsculas compactas, espaciadas y atenuadas.
 * Design: §1.1 FormField contract.
 */

export interface FormFieldProps {
  label: string
  htmlFor?: string
  error?: string
  required?: boolean
  children: React.ReactNode
  className?: string
}

function FormField({
  label,
  htmlFor,
  error,
  required,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span aria-hidden> *</span>}
      </Label>
      {children}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
FormField.displayName = 'FormField'

export { FormField }
