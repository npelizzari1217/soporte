"use client";

/**
 * RoutingAdminView — CONTAINER client component montado por
 * `/admin/routing` (T4.8). Gate `usuario:gestionar`, MISMO permiso que
 * `RoutingController` en el backend. Asocia/desasocia un técnico a un tipo
 * de ticket (`usuario_tipos_ticket`, enrutamiento de trabajo — spec T3,
 * NUNCA un permiso RBAC).
 *
 * Lista las asociaciones EXISTENTES vía `GET /routing` (item 5 backend-gaps
 * — cierra el gap "opera a ciegas" documentado en B4): antes solo se podía
 * asociar/desasociar sin ver el estado actual.
 */
import { useState } from "react";
import { useUsuariosAsignables } from "@/features/tickets/hooks/use-usuarios-asignables";
import { useTiposTicket } from "@/features/tickets/hooks/use-catalogos";
import { Can } from "@/components/shared/can";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { AdminNav } from "@/components/shell/admin-nav";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Network } from "lucide-react";
import { useRouting } from "../hooks/use-routing";
import { useAsociarRouting, useDesasociarRouting } from "../hooks/use-routing-mutations";

export function RoutingAdminView() {
  return (
    <div>
      <AdminNav />
      <Can permiso="usuario:gestionar" fallback={<ErrorState message="No tenés permiso para gestionar el routing." />}>
        <RoutingAdminContent />
      </Can>
    </div>
  );
}

function RoutingAdminContent() {
  const usuariosQuery = useUsuariosAsignables();
  const tiposQuery = useTiposTicket();
  const routingQuery = useRouting();
  const [usuarioId, setUsuarioId] = useState("");
  const [tipoTicketId, setTipoTicketId] = useState("");
  const asociarMutation = useAsociarRouting();
  const desasociarMutation = useDesasociarRouting();

  const puedeOperar = !!usuarioId && !!tipoTicketId;

  const usuarioNombreMap = new Map((usuariosQuery.data ?? []).map((u) => [u.id, `${u.nombre} ${u.apellido}`]));
  const tipoNombreMap = new Map((tiposQuery.data ?? []).map((t) => [t.id, t.nombre]));

  return (
    <div>
      <PageHeader
        title="Routing técnico ↔ tipo de ticket"
        description="Habilita o revoca qué técnicos atienden cada tipo de ticket."
      />

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="routing-usuario" className="text-sm font-medium text-foreground">
            Técnico
          </label>
          <Select
            id="routing-usuario"
            aria-label="Técnico"
            value={usuarioId}
            onChange={(e) => setUsuarioId(e.target.value)}
          >
            <option value="">Seleccioná un técnico</option>
            {usuariosQuery.data?.map((usuario) => (
              <option key={usuario.id} value={usuario.id}>
                {usuario.nombre} {usuario.apellido}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="routing-tipo" className="text-sm font-medium text-foreground">
            Tipo de ticket
          </label>
          <Select
            id="routing-tipo"
            aria-label="Tipo de ticket"
            value={tipoTicketId}
            onChange={(e) => setTipoTicketId(e.target.value)}
          >
            <option value="">Seleccioná un tipo</option>
            {tiposQuery.data?.map((tipo) => (
              <option key={tipo.id} value={tipo.id}>
                {tipo.nombre}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!puedeOperar}
            isLoading={asociarMutation.isPending}
            onClick={() => asociarMutation.mutate({ usuarioId, tipoTicketId })}
          >
            Asociar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!puedeOperar}
            isLoading={desasociarMutation.isPending}
            onClick={() => desasociarMutation.mutate({ usuarioId, tipoTicketId })}
          >
            Desasociar
          </Button>
        </div>
      </div>

      <div className="mt-4">
        {routingQuery.isLoading && (
          <div role="status" aria-busy="true" aria-label="Cargando asociaciones" className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}

        {!routingQuery.isLoading && routingQuery.isError && (
          <ErrorState
            message="No se pudieron cargar las asociaciones."
            onRetry={() => routingQuery.refetch().catch(() => {})}
          />
        )}

        {!routingQuery.isLoading && !routingQuery.isError && (routingQuery.data?.length ?? 0) === 0 && (
          <EmptyState
            icon={Network}
            title="Sin asociaciones"
            description="Todavía no hay técnicos asociados a un tipo de ticket."
          />
        )}

        {!routingQuery.isLoading && !routingQuery.isError && (routingQuery.data?.length ?? 0) > 0 && (
          <ul className="flex flex-col gap-2">
            {routingQuery.data?.map((asociacion) => {
              const nombreUsuario = usuarioNombreMap.get(asociacion.usuarioId) ?? asociacion.usuarioId;
              const nombreTipo = tipoNombreMap.get(asociacion.tipoTicketId) ?? asociacion.tipoTicketId;
              return (
                <li
                  key={`${asociacion.usuarioId}-${asociacion.tipoTicketId}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border p-2"
                >
                  <span className="text-sm text-foreground">
                    {nombreUsuario} — {nombreTipo}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Desasociar ${nombreUsuario} de ${nombreTipo}`}
                    isLoading={desasociarMutation.isPending}
                    onClick={() => desasociarMutation.mutate(asociacion)}
                  >
                    Desasociar
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
