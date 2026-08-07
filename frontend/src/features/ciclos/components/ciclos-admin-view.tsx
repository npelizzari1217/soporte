"use client";

/**
 * CiclosAdminView — CONTAINER client component montado por `/admin/ciclos`
 * (T4.5). Gate `ciclo:gestionar`. Lista los ciclos adoptados por el tenant
 * (`GET /ciclos`, G4 — reusa `useCiclos` de `features/dashboard/hooks`,
 * cross-feature) + adoptar uno nuevo + activar.
 */
import { CalendarRange } from "lucide-react";
import { useCiclos } from "@/features/dashboard/hooks/use-ciclos";
import { Can } from "@/components/shared/can";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { AdminNav } from "@/components/shell/admin-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { AdoptarCicloForm } from "./adoptar-ciclo-form";
import { CicloRow } from "./ciclo-row";

export function CiclosAdminView() {
  return (
    <div>
      <AdminNav />
      <Can permiso="ciclo:gestionar" fallback={<ErrorState message="No tenés permiso para gestionar ciclos." />}>
        <CiclosAdminContent />
      </Can>
    </div>
  );
}

function CiclosAdminContent() {
  const ciclosQuery = useCiclos();

  return (
    <div>
      <PageHeader title="Ciclos" description="Ciclos de gestión adoptados por el tenant." />

      <div className="mb-4">
        <AdoptarCicloForm />
      </div>

      {ciclosQuery.isLoading && (
        <div role="status" aria-busy="true" aria-label="Cargando ciclos" className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {!ciclosQuery.isLoading && ciclosQuery.isError && (
        <ErrorState message="No se pudieron cargar los ciclos." onRetry={() => ciclosQuery.refetch().catch(() => {})} />
      )}

      {!ciclosQuery.isLoading && !ciclosQuery.isError && (ciclosQuery.data?.ciclos.length ?? 0) === 0 && (
        <EmptyState icon={CalendarRange} title="Sin ciclos adoptados" description="Adoptá un ciclo del catálogo master para empezar." />
      )}

      {!ciclosQuery.isLoading && !ciclosQuery.isError && (ciclosQuery.data?.ciclos.length ?? 0) > 0 && (
        <div className="flex flex-col gap-2">
          {ciclosQuery.data?.ciclos.map((ciclo) => (
            <CicloRow key={ciclo.id} ciclo={ciclo} />
          ))}
        </div>
      )}
    </div>
  );
}
