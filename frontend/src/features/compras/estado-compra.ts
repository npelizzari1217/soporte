import type { BadgeProps } from "@/components/ui/badge";
import type { EstadoCompra } from "./types";

/**
 * Mapeo de `EstadoCompra` → presentación de `Badge` (mismo patrón que
 * `components/ui/status-badge.tsx` de Tickets).
 *
 * **SOLO PRESENTACIÓN.** La máquina de estados y la tabla de verdad T1-T5 +
 * Regla 0 (spec §2, ADR-C1) viven ÍNTEGRAMENTE en el backend
 * (`derivarEstadoCompra`) y llegan YA derivadas en `estado`/`comprado`/
 * `cerrado` del DTO de respuesta. Este archivo NO recalcula nada — CERO
 * lógica condicional sobre `items`. Si alguna vez hiciera falta un `if`
 * sobre ítems acá, la regla pertenece al backend, no al frontend
 * (re-derivar en el cliente duplica la tabla de verdad y es fuente segura
 * de divergencia — decisión explícita del design, ADR-C1).
 */
export interface EstadoCompraBadgeConfig {
  label: string;
  variant: BadgeProps["variant"];
  /** Sólo `CANCELADO` la usa (design: "outline atenuado") — el resto no la necesita. */
  className?: string;
}

export const ESTADO_COMPRA_CONFIG: Record<EstadoCompra, EstadoCompraBadgeConfig> = {
  PENDIENTE: { label: "Pendiente", variant: "secondary" },
  APROBADO: { label: "Aprobada", variant: "success" },
  APROBADO_PARCIALMENTE: { label: "Aprobada parcialmente", variant: "outline" },
  RECHAZADO: { label: "Rechazada", variant: "destructive" },
  CANCELADO: { label: "Cancelada", variant: "outline", className: "opacity-60" },
};
