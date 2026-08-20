"use client";

/**
 * ClientesAdminView — CONTAINER client component montado por
 * `/admin/clientes` (T4.6). Gate por `isGlobalAdmin` — NUNCA por `permisos`
 * (ROOT es ortogonal al rol/permisos de una membresía, ADR-4 / JwtPayload).
 * `<Can>` no sirve acá (solo chequea `permisos`) — se usa `useSession()`
 * directo, mismo patrón documentado en `nav-config.ts` para el ítem
 * "Clientes" del sidebar.
 */
import { useSession } from "@/shared/hooks/use-session";
import { useClientes } from "../hooks/use-clientes";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { AdminNav } from "@/components/shell/admin-nav";
import { notifyError } from "@/shared/lib/toast";
import { CrearClienteDialog } from "./crear-cliente-dialog";
import { ClienteAcciones } from "./cliente-acciones";
import type { ClienteListItem } from "../types";

export function ClientesAdminView() {
  const { isGlobalAdmin } = useSession();

  return (
    <div>
      <AdminNav />
      {isGlobalAdmin ? (
        <ClientesAdminContent />
      ) : (
        <ErrorState message="Solo ROOT puede administrar clientes." />
      )}
    </div>
  );
}

function ClientesAdminContent() {
  const clientesQuery = useClientes();

  const columns: Column<ClienteListItem>[] = [
    { key: "nombre", header: "Nombre" },
    { key: "cuit", header: "CUIT", render: (row) => row.cuit ?? "—" },
    { key: "dbName", header: "Base de datos" },
    {
      key: "activo",
      header: "Estado",
      render: (row) => (row.activo ? <Badge variant="success">Activo</Badge> : <Badge variant="outline">Inactivo</Badge>),
    },
    {
      // Resumen de correo embebido en `GET /clientes` (D7, decisión #2359):
      // visible en el listado, sin abrir la ficha de cada cliente.
      key: "correo",
      header: "Correo",
      render: (row) =>
        row.correo.configurado ? (
          <Badge variant="success">Correo configurado</Badge>
        ) : (
          <Badge variant="outline">Correo no configurado</Badge>
        ),
    },
    {
      key: "id",
      header: "Acciones",
      render: (row) => <ClienteAcciones cliente={row} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Tenants de la plataforma (solo ROOT)."
        actions={<CrearClienteDialog />}
      />
      <DataTable
        columns={columns}
        data={clientesQuery.data ?? []}
        getRowKey={(row) => row.id}
        isLoading={clientesQuery.isLoading}
        error={clientesQuery.isError ? "No se pudieron cargar los clientes." : undefined}
        onRetry={() => clientesQuery.refetch().catch(notifyError)}
        emptyTitle="Sin clientes"
        emptyDescription="Creá el primero con el botón «Nuevo cliente»."
      />
    </div>
  );
}
