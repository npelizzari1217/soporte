"use client";

/**
 * IntegracionesAdminView — CONTAINER client component montado por
 * `/admin/integraciones` (api-publica, T9 / CA3, CA4, CA8, CA9). Lista las
 * claves de la API pública del cliente activo con su último uso, y permite
 * crearlas y revocarlas. Debajo, la sección "Webhooks" (`WebhookSection`,
 * webhooks T7).
 *
 * Gate `esAdminCliente` (ADMINISTRADOR-o-ROOT) — defensa en profundidad: el
 * backend re-valida con `AdminClienteGuard` en el GET, el POST y el DELETE.
 *
 * La clave en claro vive SOLO en `claveNueva` (estado local): llega por el
 * callback de `useCrearApiClave`, se muestra en `ClaveCreadaDialog` y se tira
 * al cerrarlo. Nunca entra al cache de React Query ni a `localStorage`.
 *
 * El front no puede saber si la API del cliente está habilitada (el flag solo
 * viaja en `GET /clientes`, exclusivo de ROOT), así que "Nueva clave" queda
 * siempre activo y el 422 del backend se informa con su mensaje.
 */
import { useState } from "react";
import { SoloAdminCliente } from "@/components/shared/solo-admin-cliente";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { AdminNav } from "@/components/shell/admin-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatearInstante } from "@/shared/lib/formato-fecha";
import { notifyError } from "@/shared/lib/toast";
import { useApiClaves } from "../hooks/use-api-claves";
import { useRevocarApiClave } from "../hooks/use-api-claves-mutations";
import { ETIQUETAS_PERMISO_API } from "../schemas";
import type { ApiClave } from "../types";
import { ClaveCreadaDialog } from "./clave-creada-dialog";
import { CrearApiClaveDialog } from "./crear-api-clave-dialog";
import { WebhookSection } from "./webhook-section";
import { Plug } from "lucide-react";

function RevocarClaveButton({ clave }: { clave: ApiClave }) {
  const revocarMutation = useRevocarApiClave();
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="outline" size="sm" aria-label={`Revocar ${clave.nombre}`}>
          Revocar
        </Button>
      }
      title="Revocar clave"
      description={`¿Confirma revocar la clave "${clave.nombre}"? Las integraciones que la usan dejan de funcionar en el acto, y no se puede deshacer.`}
      confirmLabel="Revocar"
      confirmVariant="destructive"
      isConfirming={revocarMutation.isPending}
      onConfirm={() => revocarMutation.mutate(clave.id)}
    />
  );
}

function ApiClavesTable() {
  const query = useApiClaves();

  const columns: Column<ApiClave>[] = [
    {
      key: "nombre",
      header: "Nombre",
      render: (c) => <span className={c.revocadaAt ? "text-muted-foreground line-through" : undefined}>{c.nombre}</span>,
    },
    { key: "prefijo", header: "Clave", render: (c) => <code className="font-mono text-xs">{c.prefijo}…</code> },
    {
      key: "permisos",
      header: "Permisos",
      render: (c) => (
        <div className="flex flex-wrap gap-1">
          {c.permisos.map((p) => (
            <Badge key={p} variant="outline">
              {ETIQUETAS_PERMISO_API[p]}
            </Badge>
          ))}
        </div>
      ),
    },
    { key: "creadaAt", header: "Creada", render: (c) => formatearInstante(c.creadaAt) },
    {
      key: "ultimoUsoAt",
      header: "Último uso",
      render: (c) => (c.ultimoUsoAt ? formatearInstante(c.ultimoUsoAt) : "Nunca"),
    },
    {
      key: "revocadaAt",
      header: "Estado",
      render: (c) =>
        c.revocadaAt ? (
          <div className="flex flex-col items-start gap-1">
            <Badge variant="destructive">Revocada</Badge>
            <span className="text-xs text-muted-foreground">el {formatearInstante(c.revocadaAt)}</span>
          </div>
        ) : (
          <Badge variant="success">Activa</Badge>
        ),
    },
    { key: "id", header: "", render: (c) => (c.revocadaAt ? null : <RevocarClaveButton clave={c} />) },
  ];

  return (
    <DataTable variante="tarjeta"
      columns={columns}
      data={query.data ?? []}
      getRowKey={(c) => c.id}
      isLoading={query.isLoading}
      error={query.isError ? "No se pudieron cargar las claves." : undefined}
      onRetry={() => query.refetch().catch(notifyError)}
      emptyTitle="Sin claves"
      emptyDescription="Cree una clave para que un sistema externo opere con la API."
    />
  );
}

export function IntegracionesAdminView() {
  const [claveNueva, setClaveNueva] = useState<string | null>(null);

  return (
    <div>
      <AdminNav />
      <SoloAdminCliente fallback={<ErrorState message="No tiene permiso para administrar las integraciones." />}>
        <PageHeader icon={Plug}
          title="Integraciones"
          description="Claves de la API pública para que otros sistemas consulten, creen y comenten tickets, y webhooks para avisarles cuando algo cambia."
          actions={<CrearApiClaveDialog onClaveCreada={setClaveNueva} />}
        />
        <p className="mb-4 text-xs text-muted-foreground">
          La API vive en <code>/api/v1</code> y cada pedido lleva la clave en el header <code>X-Api-Key</code>. El
          contrato está en <code>/api/v1/openapi.json</code>. Para crear claves, ROOT tiene que haber habilitado la
          API de este cliente.
        </p>
        <ApiClavesTable />
        <ClaveCreadaDialog clave={claveNueva} onCerrar={() => setClaveNueva(null)} />
        <WebhookSection />
      </SoloAdminCliente>
    </div>
  );
}
