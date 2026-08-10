"use client";

/**
 * TiposComponenteAdminView — CONTAINER client component montado por
 * `/admin/tipos-componente` (PR5, sdd/tipos-componente-master). Gate por
 * `isGlobalAdmin` — NUNCA por `permisos` (ROOT es ortogonal al rol/permisos
 * de una membresía, ADR-4), mismo criterio que `ClientesAdminView` y
 * `CiclosVigentesAdminView`.
 *
 * ABM completo del catálogo GLOBAL de tipos de componente
 * (`master.tipos_componente`, backend ya existente PR1-PR4b): listar
 * (incluye inactivos), crear, renombrar, activar y desactivar.
 */
import { Tag } from "lucide-react";
import { useSession } from "@/shared/hooks/use-session";
import { useTiposComponenteAdmin } from "../hooks/use-tipos-componente";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { CrearTipoComponenteForm } from "./crear-tipo-componente-form";
import { TipoComponenteRow } from "./tipo-componente-row";

export function TiposComponenteAdminView() {
  const { isGlobalAdmin } = useSession();

  return (
    <div>
      {isGlobalAdmin ? (
        <TiposComponenteAdminContent />
      ) : (
        <ErrorState message="Solo ROOT puede administrar el catálogo de tipos de componente." />
      )}
    </div>
  );
}

function TiposComponenteAdminContent() {
  const tiposQuery = useTiposComponenteAdmin();
  const tipos = tiposQuery.data ?? [];

  return (
    <div>
      <PageHeader title="Tipos de componente" description="Catálogo maestro de tipos de componente (solo ROOT)." />

      <div className="mb-4">
        <CrearTipoComponenteForm />
      </div>

      {tiposQuery.isLoading && (
        <div role="status" aria-busy="true" aria-label="Cargando tipos de componente" className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {!tiposQuery.isLoading && tiposQuery.isError && (
        <ErrorState
          message="No se pudieron cargar los tipos de componente."
          onRetry={() => tiposQuery.refetch().catch(() => {})}
        />
      )}

      {!tiposQuery.isLoading && !tiposQuery.isError && tipos.length === 0 && (
        <EmptyState icon={Tag} title="Sin tipos de componente" description="Creá el primero con el formulario de arriba." />
      )}

      {!tiposQuery.isLoading && !tiposQuery.isError && tipos.length > 0 && (
        <div className="flex flex-col gap-2">
          {tipos.map((tipo) => (
            <TipoComponenteRow key={tipo.id} tipo={tipo} />
          ))}
        </div>
      )}
    </div>
  );
}
