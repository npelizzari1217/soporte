"use client";

/**
 * SlaAdminView — CONTAINER client component montado por `/admin/sla` (T4.4).
 * Gate `catalogo:gestionar` (S1 — reusa el mismo permiso que catálogos, sin
 * `sla:gestionar` nuevo, decisión ya tomada en backend). `horas` por
 * prioridad (CRÍTICA/ALTA/... configurable).
 */
import { useSlaConfig } from "../hooks/use-sla";
import { usePrioridades } from "@/features/tickets/hooks/use-catalogos";
import { Can } from "@/components/shared/can";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { AdminNav } from "@/components/shell/admin-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { TimerReset } from "lucide-react";
import { SlaConfigRow } from "./sla-config-row";

export function SlaAdminView() {
  return (
    <div>
      <AdminNav />
      <Can permiso="catalogo:gestionar" fallback={<ErrorState message="No tenés permiso para gestionar el SLA." />}>
        <SlaAdminContent />
      </Can>
    </div>
  );
}

function SlaAdminContent() {
  const slaQuery = useSlaConfig();
  const prioridadesQuery = usePrioridades();

  const isLoading = slaQuery.isLoading || prioridadesQuery.isLoading;
  const isError = slaQuery.isError || prioridadesQuery.isError;

  return (
    <div>
      <PageHeader title="Configuración de SLA" description="Horas de resolución objetivo por prioridad." />

      {isLoading && (
        <div role="status" aria-busy="true" aria-label="Cargando configuración de SLA" className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {!isLoading && isError && (
        <ErrorState
          message="No se pudo cargar la configuración de SLA."
          onRetry={() => {
            slaQuery.refetch().catch(() => {});
            prioridadesQuery.refetch().catch(() => {});
          }}
        />
      )}

      {!isLoading && !isError && (slaQuery.data?.length ?? 0) === 0 && (
        <EmptyState icon={TimerReset} title="Sin configuración de SLA" description="No hay filas de sla_config para este tenant." />
      )}

      {!isLoading && !isError && (slaQuery.data?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-2">
          {slaQuery.data?.map((config) => {
            const prioridad = prioridadesQuery.data?.find((p) => p.id === config.prioridadId);
            return <SlaConfigRow key={config.id} config={config} prioridadNombre={prioridad?.nombre ?? config.prioridadId} />;
          })}
        </div>
      )}
    </div>
  );
}
