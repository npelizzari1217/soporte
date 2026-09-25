/**
 * OrigenFeriadoBadge — mismo patrón que `StatusBadge`/`EstadoCompraBadge`
 * (`components/ui/status-badge.tsx`): config estático `origen -> {label,
 * variant}`, cero lógica condicional en el componente.
 *
 * `OrigenFeriado` es un tipo puramente de frontend: el backend nunca lo
 * devuelve (`GET /feriados` y `GET /feriados-cliente` no llevan un campo de
 * origen) — lo asigna `combinarFeriados()` (tarea 8.1) según de qué endpoint
 * vino cada fila. Vive en `../types.ts` (tarea 6.3, WU6b) y se reexporta acá
 * sin cambiar su forma, para no romper a quien ya lo importaba desde este
 * archivo en WU6a.
 */
import { Badge } from "@/components/ui/badge";
import type { OrigenFeriado } from "../types";

export type { OrigenFeriado };

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
    // `whitespace-nowrap`: la columna Origen es angosta y "Del cliente" se partía
    // en dos líneas, al lado de "Nacional" que entra en una.
    <Badge data-testid="origen-feriado-badge" variant={config.variant} className="whitespace-nowrap">
      {config.label}
    </Badge>
  );
}
