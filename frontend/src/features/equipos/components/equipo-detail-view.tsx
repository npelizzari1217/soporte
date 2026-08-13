"use client";

/**
 * EquipoDetailView — CONTAINER montado por `/equipos/[id]` (T5.13). Edición en
 * MODAL (`EquipoEditDialog`) + baja lógica detrás de `ConfirmDialog` +
 * componentes. Gate `equipo:gestionar` (todas las mutaciones), consistente con
 * `EquiposController`. La asignación a personas se eliminó del dominio Equipos
 * — vive solo en `Ticket`.
 *
 * Toolbar de acciones: incluye `ComponenteCreateDialog` (alta de componente
 * con los 4 campos completos). El form inline de alta que existía antes en
 * `EquipoComponentesSection` (solo tipo + capacidad, incompleto) fue
 * retirado — el alta vive únicamente acá.
 */
import { useRouter } from "next/navigation";
import { DetailSkeleton } from "@/components/shared/skeletons";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Can } from "@/components/shared/can";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useEquipo } from "../hooks/use-equipos";
import { useEliminarEquipo } from "../hooks/use-equipo-mutations";
import { ComponenteCreateDialog } from "./componente-create-dialog";
import { EquipoComponentesSection } from "./equipo-componentes-section";
import { EquipoEditDialog } from "./equipo-edit-dialog";

export interface EquipoDetailViewProps {
  equipoId: string;
}

export function EquipoDetailView({ equipoId }: EquipoDetailViewProps) {
  const router = useRouter();
  const equipoQuery = useEquipo(equipoId);
  const eliminarMutation = useEliminarEquipo();

  if (equipoQuery.isLoading) return <DetailSkeleton />;
  if (equipoQuery.isError || !equipoQuery.data) {
    return (
      <ErrorState
        message="No se pudo cargar el equipo."
        onRetry={() => {
          equipoQuery.refetch().catch(() => {});
        }}
      />
    );
  }

  const equipo = equipoQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={equipo.nombre}
        description={equipo.numeroSerie ?? undefined}
        actions={
          <Can permiso="equipo:gestionar">
            <div className="flex items-center gap-2">
              <ComponenteCreateDialog equipoId={equipo.id} />
              <EquipoEditDialog equipo={equipo} />
              <ConfirmDialog
                trigger={
                  <Button variant="destructive" size="sm">
                    Dar de baja
                  </Button>
                }
                title="Dar de baja equipo"
                description={`¿Confirmás dar de baja "${equipo.nombre}"?`}
                confirmLabel="Dar de baja"
                confirmVariant="destructive"
                isConfirming={eliminarMutation.isPending}
                onConfirm={() => eliminarMutation.mutate(equipo.id, { onSuccess: () => router.push("/equipos") })}
              />
            </div>
          </Can>
        }
      />

      <EquipoComponentesSection equipoId={equipo.id} componentes={equipo.componentes} />
    </div>
  );
}
