import { Badge, type BadgeProps } from "./badge";

/**
 * StatusBadge — maps the fixed ticket workflow estado (spec §R-M1: NUEVO →
 * ASIGNADO → EN_PROCESO → RESUELTO → CERRADO, + CANCELADO, sin reapertura)
 * to a token-driven Badge variant + Spanish label.
 */
export type TicketEstado = "NUEVO" | "ASIGNADO" | "EN_PROCESO" | "ESPERANDO_CLIENTE" | "RESUELTO" | "CERRADO" | "CANCELADO";

const ESTADO_CONFIG: Record<TicketEstado, { label: string; variant: BadgeProps["variant"] }> = {
  NUEVO: { label: "Nuevo", variant: "default" },
  ASIGNADO: { label: "Asignado", variant: "secondary" },
  EN_PROCESO: { label: "En proceso", variant: "warning" },
  ESPERANDO_CLIENTE: { label: "Esperando al cliente", variant: "secondary" },
  RESUELTO: { label: "Resuelto", variant: "success" },
  CERRADO: { label: "Cerrado", variant: "outline" },
  CANCELADO: { label: "Cancelado", variant: "destructive" },
};

export interface StatusBadgeProps {
  estado: TicketEstado;
}

export function StatusBadge({ estado }: StatusBadgeProps) {
  const config = ESTADO_CONFIG[estado];
  return (
    <Badge data-testid="status-badge" variant={config.variant}>
      {config.label}
    </Badge>
  );
}
