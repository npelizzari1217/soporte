"use client";

/**
 * UsuariosAdminView — CONTAINER client component montado por
 * `/admin/usuarios` (T4.7, migrado en WU-7.6 —
 * `sdd/matriz-permisos-por-usuario` ADR-P5).
 *
 * Gating: UN SOLO gate (`<SoloAdminCliente>`, `esAdminCliente` =
 * ADMINISTRADOR-o-ROOT), mismo criterio que el backend
 * `AdminClienteGuard`/`esAdminDeCliente`. Reemplaza el AND anidado de dos
 * permisos RBAC viejos (`usuario:gestionar` + `rol:asignar`, retirados con
 * `roles_permisos`) — la configuración de usuarios ya no tiene celda propia
 * en la matriz, es un chequeo de identidad (R4).
 */
import { Users } from "lucide-react";
import { useUsuariosTenant } from "../hooks/use-usuarios-tenant";
import { SoloAdminCliente } from "@/components/shared/solo-admin-cliente";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { AdminNav } from "@/components/shell/admin-nav";
import { notifyError } from "@/shared/lib/toast";
import { CrearUsuarioDialog } from "./crear-usuario-dialog";
import { EditarUsuarioDialog } from "./editar-usuario-dialog";
import { CambiarRolControl } from "./cambiar-rol-control";
import { DesactivarMembresiaControl } from "./desactivar-membresia-control";
import { AsignarPermisosControl } from "./asignar-permisos-control";
import type { UsuarioTenant } from "../types";

export function UsuariosAdminView() {
  return (
    <div>
      <AdminNav />
      <SoloAdminCliente fallback={<ErrorState message="No tenés permiso para gestionar usuarios." />}>
        <UsuariosAdminContent />
      </SoloAdminCliente>
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
        <div className="flex items-center gap-2">
          <EditarUsuarioDialog usuario={row} />
          <CambiarRolControl usuario={row} />
          <AsignarPermisosControl usuario={row} />
          <DesactivarMembresiaControl usuario={row} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Usuarios y membresías"
        description="Usuarios con membresía activa en este tenant."
        actions={<CrearUsuarioDialog />}
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
