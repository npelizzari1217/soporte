"use client";

/**
 * use-metricas — CONTAINER hook para `GET /dashboard/metricas` (D1, R-M2 /
 * T2.1). Gateado por `ticket:ver_todos` a nivel de controller (D3) — un 403
 * se propaga como `ApiError` normal, gestionado por `DashboardView`.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { MetricasDashboard } from "../types";

/** Ciclo explícito (histórico) → query string; sin valor → el backend resuelve el ciclo ACTIVO. */
export function buildMetricasPath(cicloId: string | undefined): string {
  return cicloId ? `dashboard/metricas?ciclo=${cicloId}` : "dashboard/metricas";
}

export function useMetricas(cicloId: string | undefined) {
  return useQuery({
    queryKey: ["dashboard", "metricas", cicloId],
    queryFn: () => apiFetch<MetricasDashboard>(buildMetricasPath(cicloId)),
  });
}
