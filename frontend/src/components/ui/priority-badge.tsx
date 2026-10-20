import { Badge } from "./badge";
import { PASTILLA, contenidoAnchoUniforme } from "./status-badge";
import { cn } from "@/lib/utils";

/**
 * PriorityBadge — prioridad is a tenant-configurable catálogo (backend
 * `GET /catalogos/prioridades`, código arbitrario), NOT a fixed enum. We map
 * the common default codes (BAJA/MEDIA/ALTA/CRITICA) to a pastel pill; any
 * unrecognized/tenant-custom code falls back to a neutral pill rendering the
 * raw code verbatim (never hides the value).
 *
 * Cada color lleva su par `dark:` para sostener el contraste en modo oscuro.
 */
const KNOWN_PRIORIDAD_CONFIG: Record<string, { label: string; className: string }> = {
  BAJA: {
    label: "Baja",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  },
  MEDIA: {
    label: "Media",
    className:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  },
  ALTA: {
    label: "Alta",
    className: "border-red-200 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-900/40 dark:text-red-200",
  },
  CRITICA: {
    label: "Crítica",
    className: "border-transparent bg-red-600 text-white dark:bg-red-600 dark:text-white",
  },
};

const NEUTRA = "border-border bg-muted text-muted-foreground";

export interface PriorityBadgeProps {
  prioridad: string;
}

export function PriorityBadge({ prioridad }: PriorityBadgeProps) {
  const config = KNOWN_PRIORIDAD_CONFIG[prioridad.toUpperCase()];
  return (
    <Badge data-testid="priority-badge" variant="outline" className={cn(PASTILLA, config?.className ?? NEUTRA)}>
      {contenidoAnchoUniforme(config?.label ?? prioridad, KNOWN_PRIORIDAD_CONFIG.MEDIA.label)}
    </Badge>
  );
}
