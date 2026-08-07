import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Select — native `<select>` estilizado (NO `@radix-ui/react-select`).
 *
 * Deviación documentada vs ADR-6 (que listaba `select` entre los componentes
 * shadcn "ya presentes" como dependencia radix instalada): para B1 se optó
 * por un `<select>` nativo estilizado en vez de envolver
 * `@radix-ui/react-select`. Motivo: los usos de B1 (tipo/prioridad/estado/
 * asignado) son listas simples de opciones sin necesidad de typeahead ni
 * multi-select — el nativo cubre el caso 100%, es accesible por defecto
 * (teclado/lector de pantalla sin trabajo extra), y evita la fricción de
 * portales Radix + jsdom en tests (mismo criterio que B0 con el drawer del
 * sidebar). Puede migrarse a Radix Select en un batch posterior si un
 * feature necesita más que esto.
 */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error = false, children, ...props }, ref) => (
    <div className="relative">
      <select
        className={cn(
          "flex h-9 w-full appearance-none rounded-xl border border-input bg-background text-foreground px-3 py-2 pr-8 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors [&>option]:bg-background [&>option]:text-foreground",
          error && "border-destructive focus-visible:ring-destructive/30",
          className,
        )}
        aria-invalid={error || undefined}
        ref={ref}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  ),
);
Select.displayName = "Select";

export { Select };
