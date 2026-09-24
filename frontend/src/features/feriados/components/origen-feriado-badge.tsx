/**
 * OrigenFeriadoBadge — mismo patrón que `StatusBadge`/`EstadoCompraBadge`
 * (`components/ui/status-badge.tsx`): config estático `origen -> {label,
 * variant}`, cero lógica condicional en el componente.
 *
 * `OrigenFeriado` es un tipo puramente de frontend: el backend nunca lo
 * devuelve (`GET /feriados` y `GET /feriados-cliente` no llevan un campo de
 * origen) — lo asigna `combinarFeriados()` (tarea 8.1) según de qué endpoint
 * vino cada fila. Se declara acá porque `types.ts` de la feature todavía no
 * existe (tarea 6.3, WU6b); cuando exista, este tipo se mueve/reexporta desde
 * ahí sin cambiar su forma.
 */
import { Badge } from "@/components/ui/badge";

export type OrigenFeriado = "GLOBAL" | "CLIENTE";

const ORIGEN_CONFIG: Record<OrigenFeriado, { label: string; variant: "success-light" | "info" }> = {
  GLOBAL: { label: "Nacional", variant: "success-light" },
  CLIENTE: { label: "Del cliente", variant: "info" },
};

export interface OrigenFeriadoBadgeProps {
  origen: OrigenFeriado;
}

export function OrigenFeriadoBadge({ origen }: OrigenFeriadoBadgeProps) {
  const config = ORIGEN_CONFIG[origen];
  return (
    <Badge data-testid="origen-feriado-badge" variant={config.variant}>
      {config.label}
    </Badge>
  );
}
