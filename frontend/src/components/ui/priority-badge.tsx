import { Badge, type BadgeProps } from "./badge";

/**
 * PriorityBadge — prioridad is a tenant-configurable catálogo (backend
 * `GET /catalogos/prioridades`, código arbitrario), NOT a fixed enum. We map
 * the common default codes (BAJA/MEDIA/ALTA/CRITICA) to design tokens for a
 * premium look; any unrecognized/tenant-custom code falls back to an
 * `outline` badge rendering the raw code verbatim (never hides the value).
 */
const KNOWN_PRIORIDAD_CONFIG: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  BAJA: { label: "Baja", variant: "secondary" },
  MEDIA: { label: "Media", variant: "default" },
  ALTA: { label: "Alta", variant: "warning" },
  CRITICA: { label: "Crítica", variant: "destructive" },
};

export interface PriorityBadgeProps {
  prioridad: string;
}

export function PriorityBadge({ prioridad }: PriorityBadgeProps) {
  const config = KNOWN_PRIORIDAD_CONFIG[prioridad.toUpperCase()];
  if (!config) {
    return (
      <Badge data-testid="priority-badge" variant="outline">
        {prioridad}
      </Badge>
    );
  }
  return (
    <Badge data-testid="priority-badge" variant={config.variant}>
      {config.label}
    </Badge>
  );
}
