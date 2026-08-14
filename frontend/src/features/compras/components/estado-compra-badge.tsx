/**
 * EstadoCompraBadge — wrapper de presentación sobre `ESTADO_COMPRA_CONFIG`
 * (`../estado-compra.ts`, PR-23), mismo patrón que `StatusBadge`/
 * `PriorityBadge` de Tickets (`components/ui/status-badge.tsx`).
 *
 * CERO lógica condicional sobre ítems: solo lee el config estático — el
 * `estado` ya llega DERIVADO por el backend (ADR-C1, `derivarEstadoCompra`).
 */
import { Badge } from "@/components/ui/badge";
import { ESTADO_COMPRA_CONFIG } from "../estado-compra";
import type { EstadoCompra } from "../types";

export interface EstadoCompraBadgeProps {
  estado: EstadoCompra;
}

export function EstadoCompraBadge({ estado }: EstadoCompraBadgeProps) {
  const config = ESTADO_COMPRA_CONFIG[estado];
  return (
    <Badge data-testid="estado-compra-badge" variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  );
}
