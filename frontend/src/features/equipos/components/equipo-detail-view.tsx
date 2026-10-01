"use client";

/**
 * EquipoDetailView — CONTAINER montado por `/equipos/[id]` (T5.13). Edición en
 * MODAL (`EquipoEditDialog`) + borrado (equipo cargado por error) detrás de `ConfirmDialog` +
 * componentes. Gates por acción (WU-7.6, `sdd/matriz-permisos-por-usuario`):
 * `EQUIPOS:ALTAS` (agregar componente), `EQUIPOS:MODIFICACION` (editar
 * equipo), `EQUIPOS:BORRADO` (eliminar equipo cargado por error) — separados, ya no un único
 * `equipo:gestionar` para las tres mutaciones. Consistente con
 * `EquiposController`. La asignación a personas se eliminó del dominio Equipos
 * — vive solo en `Ticket`.
 *
 * Toolbar de acciones: incluye `ComponenteCreateDialog`, el único alta de
 * componente: elige un repuesto del catálogo y, con la casilla "Descontar del
 * depósito", descuenta stock en la MISMA transacción. El form inline de alta que existía antes en
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
          <div className="flex items-center gap-2">
            <Can permiso="EQUIPOS:ALTAS">
              <ComponenteCreateDialog equipoId={equipo.id} />
            </Can>
            <Can permiso="EQUIPOS:MODIFICACION">
              <EquipoEditDialog equipo={equipo} />
            </Can>
            <Can permiso="EQUIPOS:BORRADO">
              <ConfirmDialog
                trigger={
                  <Button variant="destructive" size="sm">
                    Eliminar equipo (cargado por error)
                  </Button>
                }
                title="Eliminar equipo"
                description={`¿Confirmás eliminar "${equipo.nombre}"? Solo para equipos cargados por error. Si tiene piezas instaladas, dalo de baja.`}
                confirmLabel="Eliminar equipo"
                confirmVariant="destructive"
                isConfirming={eliminarMutation.isPending}
                onConfirm={() => eliminarMutation.mutate(equipo.id, { onSuccess: () => router.push("/equipos") })}
              />
            </Can>
          </div>
        }
      />

      <EquipoComponentesSection equipoId={equipo.id} componentes={equipo.componentes} />
    </div>
  );
}
