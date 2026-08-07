"use client";

/**
 * UsuariosAdminView — CONTAINER client component montado por
 * `/admin/usuarios` (T4.7 — reemplaza el placeholder original: G3
 * `usuario:gestionar`/`rol:asignar` YA tiene backend real, ver
 * apply-progress previo).
 *
 * Gating en DOS niveles (AND, no OR — mismo criterio que el backend
 * `@RequirePermissions('usuario:gestionar','rol:asignar')`):
 * - Página completa: `usuario:gestionar` (ver la lista).
 * - Mutar (crear/cambiar rol/desactivar): `usuario:gestionar` AND
 *   `rol:asignar` (nested `<Can>`) — con solo `usuario:gestionar` se VE la
 *   lista pero ninguna acción de escritura.
 */
import { Users } from "lucide-react";
import { useUsuariosTenant } from "../hooks/use-usuarios-tenant";
import { Can } from "@/components/shared/can";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { AdminNav } from "@/components/shell/admin-nav";
import { notifyError } from "@/shared/lib/toast";
import { CrearUsuarioDialog } from "./crear-usuario-dialog";
import { CambiarRolControl } from "./cambiar-rol-control";
import { DesactivarMembresiaControl } from "./desactivar-membresia-control";
import { AsignarModulosControl } from "./asignar-modulos-control";
import type { UsuarioTenant } from "../types";

export function UsuariosAdminView() {
  return (
    <div>
      <AdminNav />
      <Can permiso="usuario:gestionar" fallback={<ErrorState message="No tenés permiso para gestionar usuarios." />}>
        <UsuariosAdminContent />
      </Can>
    </div>
  );
}

function UsuariosAdminContent() {
  const usuariosQuery = useUsuariosTenant();

  const columns: Column<UsuarioTenant>[] = [
    { key: "nombre", header: "Nombre", render: (row) => `${row.nombre} ${row.apellido}` },
    { key: "email", header: "Email", render: (row) => row.email ?? "—" },
    { key: "rol", header: "Rol" },
    {
      key: "id",
      header: "Acciones",
      render: (row) => (
        <Can permiso="rol:asignar">
          <div className="flex items-center gap-2">
            <CambiarRolControl usuario={row} />
            <AsignarModulosControl usuario={row} />
            <DesactivarMembresiaControl usuario={row} />
          </div>
        </Can>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Usuarios y membresías"
        description="Usuarios con membresía activa en este tenant."
        actions={
          <Can permiso="rol:asignar">
            <CrearUsuarioDialog />
          </Can>
        }
      />

      {usuariosQuery.isLoading || usuariosQuery.isError ? (
        <DataTable
          columns={columns}
          data={[]}
          getRowKey={(row) => row.id}
          isLoading={usuariosQuery.isLoading}
          error={usuariosQuery.isError ? "No se pudieron cargar los usuarios." : undefined}
          onRetry={() => usuariosQuery.refetch().catch(notifyError)}
        />
      ) : (usuariosQuery.data?.length ?? 0) === 0 ? (
        <EmptyState icon={Users} title="Sin usuarios" description="Todavía no hay usuarios con membresía en este tenant." />
      ) : (
        <DataTable columns={columns} data={usuariosQuery.data ?? []} getRowKey={(row) => row.id} />
      )}
    </div>
  );
}
