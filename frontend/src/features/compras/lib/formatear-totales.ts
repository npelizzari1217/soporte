/**
 * formatearTotalesPorMoneda — formatea `CompraListItem.totalesPorMoneda`
 * (suma de TODOS los ítems no eliminados, spec §7 punto 1 — YA calculada y
 * derivada por el backend) para la columna "Totales por moneda" del
 * listado (PR-24).
 *
 * Presentación pura: no decide NADA sobre el estado de la compra ni
 * inspecciona ítems (esa regla vive en el backend, ADR-C1) — solo formatea
 * números que ya llegaron resueltos en el DTO.
 *
 * El formato es-AR en sí vive en `@/shared/lib/formato-numero`, compartido con
 * el detalle de ítems y con el input de monto.
 */
import { formatearMontoConMoneda } from "@/shared/lib/formato-numero";

export function formatearTotalesPorMoneda(totales: Record<string, number>): string {
  const entradas = Object.entries(totales);
  if (entradas.length === 0) return "—";
  return entradas.map(([moneda, monto]) => formatearMontoConMoneda(moneda, monto)).join(" · ");
}
