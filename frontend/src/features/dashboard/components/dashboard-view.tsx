"use client";

/**
 * DashboardView — CONTAINER client component montado por `/dashboard`
 * (ADR-1). KPIs del tenant (o del propio scope si TECNICO — resuelto
 * server-side, D2) con filtro por ciclo (R-M2 / T2.2-T2.6).
 *
 * El backend gatea la ruta completa con `ticket:ver_todos` (D3) — USUARIO
 * queda fuera. El sidebar ya oculta el ítem (nav-config, B0); esta vista
 * además maneja el 403 real por si se navega directo a la URL.
 */
import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { useMetricas } from "../hooks/use-metricas";
import { useCiclos } from "../hooks/use-ciclos";
import { useTiposTicket, usePrioridades } from "@/features/tickets/hooks/use-catalogos";
import { useUsuariosAsignables } from "@/features/tickets/hooks/use-usuarios-asignables";
import {
  toAbiertosCerradosChartData,
  toCargaPorAgenteChartData,
  toDistribucionChartData,
  toSlaPercentage,
  toTiempoPromedioChartData,
} from "../lib/metricas-map";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { CardKpiSkeleton } from "@/components/shared/skeletons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { BarChart } from "@/shared/charts/bar-chart";
import { LineChart } from "@/shared/charts/line-chart";
import { HBarChart } from "@/shared/charts/hbar-chart";
import { DonutChart } from "@/shared/charts/donut-chart";
import { GaugeChart } from "@/shared/charts/gauge-chart";
import { ApiError } from "@/shared/api/types";
import { notifyError } from "@/shared/lib/toast";

const KPI_CARD_COUNT = 6;

export function DashboardView() {
  const [cicloId, setCicloId] = useState<string | undefined>(undefined);

  const ciclosQuery = useCiclos();
  const metricasQuery = useMetricas(cicloId);
  const tiposQuery = useTiposTicket();
  const prioridadesQuery = usePrioridades();
  const usuariosQuery = useUsuariosAsignables();

  const tipoNombreMap = useMemo(
    () => new Map((tiposQuery.data ?? []).map((tipo) => [tipo.id, tipo.nombre])),
    [tiposQuery.data],
  );
  const prioridadNombreMap = useMemo(
    () => new Map((prioridadesQuery.data ?? []).map((prioridad) => [prioridad.id, prioridad.nombre])),
    [prioridadesQuery.data],
  );
  const usuarioNombreMap = useMemo(
    () => new Map((usuariosQuery.data ?? []).map((usuario) => [usuario.id, `${usuario.nombre} ${usuario.apellido}`])),
    [usuariosQuery.data],
  );

  const cicloFiltro = (
    <div className="flex flex-col gap-1">
      <label htmlFor="filtro-ciclo" className="sr-only">
        Ciclo
      </label>
      <Select
        id="filtro-ciclo"
        value={cicloId ?? ""}
        onChange={(e) => setCicloId(e.target.value || undefined)}
      >
        <option value="">Ciclo activo</option>
        {(ciclosQuery.data?.ciclos ?? []).map((ciclo) => (
          <option key={ciclo.id} value={ciclo.id}>
            {ciclo.nombre}
          </option>
        ))}
      </Select>
    </div>
  );

  if (metricasQuery.isLoading) {
    return (
      <div>
        <PageHeader title="Dashboard" actions={cicloFiltro} />
        <CardKpiSkeleton count={KPI_CARD_COUNT} />
      </div>
    );
  }

  if (metricasQuery.isError || !metricasQuery.data) {
    const isForbidden = metricasQuery.error instanceof ApiError && metricasQuery.error.statusCode === 403;
    return (
      <div>
        <PageHeader title="Dashboard" actions={cicloFiltro} />
        <ErrorState
          message={
            isForbidden
              ? "No tenés permiso para ver el dashboard."
              : "No se pudieron cargar las métricas del dashboard."
          }
          onRetry={
            isForbidden
              ? undefined
              : () => {
                  metricasQuery.refetch().catch(notifyError);
                }
          }
        />
      </div>
    );
  }

  const metricas = metricasQuery.data;
  const sinDatos =
    metricas.abiertos === 0 &&
    metricas.cerrados === 0 &&
    metricas.distribucionPorTipo.length === 0 &&
    metricas.distribucionPorPrioridad.length === 0;

  return (
    <div>
      <PageHeader title="Dashboard" actions={cicloFiltro} />

      {sinDatos ? (
        <EmptyState
          icon={BarChart3}
          title="Sin datos"
          description="No hay tickets registrados en este ciclo todavía."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Tickets abiertos / cerrados</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart title="Tickets abiertos / cerrados" data={toAbiertosCerradosChartData(metricas)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tiempo promedio de resolución (h)</CardTitle>
            </CardHeader>
            <CardContent>
              {metricas.tiempoPromedioResolucionHoras === null ? (
                <p className="text-sm text-muted-foreground">Sin cierres con SLA en este ciclo todavía.</p>
              ) : (
                <LineChart
                  title="Tiempo promedio de resolución (h)"
                  data={toTiempoPromedioChartData(metricas.tiempoPromedioResolucionHoras)}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Carga por agente</CardTitle>
            </CardHeader>
            <CardContent>
              {metricas.cargaPorAgente.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin tickets abiertos asignados.</p>
              ) : (
                <HBarChart
                  title="Carga por agente"
                  data={toCargaPorAgenteChartData(metricas.cargaPorAgente, usuarioNombreMap)}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>% Cumplimiento SLA</CardTitle>
            </CardHeader>
            <CardContent>
              <GaugeChart title="% Cumplimiento SLA" value={toSlaPercentage(metricas.cumplimientoSla)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Distribución por tipo</CardTitle>
            </CardHeader>
            <CardContent>
              {metricas.distribucionPorTipo.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin datos.</p>
              ) : (
                <DonutChart
                  title="Distribución por tipo"
                  data={toDistribucionChartData(metricas.distribucionPorTipo, (d) => d.tipoId, tipoNombreMap)}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Distribución por prioridad</CardTitle>
            </CardHeader>
            <CardContent>
              {metricas.distribucionPorPrioridad.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin datos.</p>
              ) : (
                <DonutChart
                  title="Distribución por prioridad"
                  data={toDistribucionChartData(
                    metricas.distribucionPorPrioridad,
                    (d) => d.prioridadId,
                    prioridadNombreMap,
                  )}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
