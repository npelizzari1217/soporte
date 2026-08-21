"use client";

/**
 * CiclosVigentesAdminView — CONTAINER client component montado por `/ciclos`
 * (sdd/ciclos-abm-root). Gate por `isGlobalAdmin` — NUNCA por `permisos`
 * (ROOT es ortogonal al rol/permisos de una membresía, ADR-4), mismo
 * criterio que `ClientesAdminView` (`/admin/clientes`).
 *
 * ABM completo del catálogo MASTER de ciclos lectivos. Distinto de
 * `/admin/ciclos` (`features/ciclos`, adopción/activación por el admin del
 * cliente) — este es el catálogo, no la adopción.
 */
import { Plus } from "lucide-react";
import { useSession } from "@/shared/hooks/use-session";
import { useCiclosVigentesAdmin } from "../hooks/use-ciclos-vigentes-admin";
import { useEliminarCicloVigente } from "../hooks/use-ciclos-vigentes-admin-mutations";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { notifyError } from "@/shared/lib/toast";
import { formatearFechaCalendario } from "@/shared/lib/formato-fecha";
import { CicloVigenteFormDialog } from "./ciclo-vigente-form-dialog";
import type { CicloVigenteAdmin } from "../types";

export function CiclosVigentesAdminView() {
  const { isGlobalAdmin } = useSession();

  return (
    <div>
      {isGlobalAdmin ? (
        <CiclosVigentesAdminContent />
      ) : (
        <ErrorState message="Solo ROOT puede administrar el catálogo de ciclos." />
      )}
    </div>
  );
}

function EliminarCicloVigenteAction({ ciclo }: { ciclo: CicloVigenteAdmin }) {
  const mutation = useEliminarCicloVigente();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm" disabled={ciclo.eliminado}>
          Eliminar
        </Button>
      }
      title="Eliminar ciclo"
      description={`¿Confirmás eliminar "${ciclo.nombre}"? Los clientes que ya lo adoptaron no se ven afectados — solo deja de ofrecerse para nuevas adopciones.`}
      confirmLabel="Eliminar"
      confirmVariant="destructive"
      isConfirming={mutation.isPending}
      onConfirm={() => mutation.mutate(ciclo.id)}
    />
  );
}

function CiclosVigentesAdminContent() {
  const ciclosQuery = useCiclosVigentesAdmin();
  const ciclos = ciclosQuery.data ?? [];

  const columns: Column<CicloVigenteAdmin>[] = [
    { key: "nombre", header: "Nombre" },
    // CicloVigenteAdmin.fechaInicio es @db.Date — fecha de calendario.
    { key: "fechaInicio", header: "Inicio", render: (row) => formatearFechaCalendario(row.fechaInicio) },
    // CicloVigenteAdmin.fechaFin es @db.Date — fecha de calendario.
    { key: "fechaFin", header: "Fin", render: (row) => formatearFechaCalendario(row.fechaFin) },
    {
      key: "eliminado",
      header: "Estado",
      render: (row) =>
        row.eliminado ? <Badge variant="outline">Eliminado</Badge> : <Badge variant="success">Vigente</Badge>,
    },
    {
      key: "id",
      header: "Acciones",
      render: (row) => (
        <div className="flex items-center gap-2">
          <CicloVigenteFormDialog
            ciclo={row}
            trigger={
              <Button variant="outline" size="sm" disabled={row.eliminado}>
                Editar
              </Button>
            }
          />
          <EliminarCicloVigenteAction ciclo={row} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Ciclos"
        description="Catálogo maestro de ciclos lectivos (solo ROOT). Cada cliente elige y activa un ciclo de este catálogo desde Admin > Ciclos."
        actions={
          <CicloVigenteFormDialog
            trigger={
              <Button size="sm">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nuevo ciclo
              </Button>
            }
          />
        }
      />
      <DataTable
        columns={columns}
        data={ciclos}
        getRowKey={(row) => row.id}
        isLoading={ciclosQuery.isLoading}
        error={ciclosQuery.isError ? "No se pudieron cargar los ciclos." : undefined}
        onRetry={() => ciclosQuery.refetch().catch(notifyError)}
        emptyTitle="Sin ciclos"
        emptyDescription="Creá el primero con «Nuevo ciclo»."
      />
    </div>
  );
}
