"use client";

/**
 * TicketDetailView — CONTAINER client component montado por `/tickets/:id`
 * (ADR-1). Orquesta detalle + timeline + acciones gateadas por permiso
 * (R-M1 / T1.6-T1.13).
 */
import { useMemo, useState } from "react";
import { useTicket, useTicketTimeline } from "../hooks/use-ticket";
import { useTiposTicket, usePrioridades, useEstados, useTiposOperacion } from "../hooks/use-catalogos";
import { useUsuariosAsignables } from "../hooks/use-usuarios-asignables";
import {
  useAsignarTicket,
  useComentar,
  useEditarTicket,
  useSubirAdjunto,
  useTransicionarEstado,
} from "../hooks/use-ticket-mutations";
import { buildIdToCodigoMap } from "../lib/catalog-map";
import { DetailSkeleton } from "@/components/shared/skeletons";
import { ErrorState } from "@/components/shared/error-state";
import { Can } from "@/components/shared/can";
import { Button } from "@/components/ui/button";
import { TicketHeader } from "./ticket-header";
import { TicketTimeline } from "./ticket-timeline";
import { TicketCommentForm } from "./ticket-comment-form";
import { TicketTransitionControl } from "./ticket-transition-control";
import { TicketAssignControl } from "./ticket-assign-control";
import { TicketEditForm } from "./ticket-edit-form";
import { TicketAttachmentUpload } from "./ticket-attachment-upload";

export interface TicketDetailViewProps {
  ticketId: string;
}

export function TicketDetailView({ ticketId }: TicketDetailViewProps) {
  const ticketQuery = useTicket(ticketId);
  const timelineQuery = useTicketTimeline(ticketId);
  const tiposQuery = useTiposTicket();
  const prioridadesQuery = usePrioridades();
  const estadosQuery = useEstados();
  const tiposOperacionQuery = useTiposOperacion();
  const usuariosQuery = useUsuariosAsignables();

  const comentarMutation = useComentar(ticketId);
  const transicionarMutation = useTransicionarEstado(ticketId);
  const asignarMutation = useAsignarTicket(ticketId);
  const editarMutation = useEditarTicket(ticketId);
  const adjuntarMutation = useSubirAdjunto(ticketId);

  const [editando, setEditando] = useState(false);

  const estadoCodigoMap = useMemo(() => buildIdToCodigoMap(estadosQuery.data ?? []), [estadosQuery.data]);
  const prioridadCodigoMap = useMemo(
    () => buildIdToCodigoMap(prioridadesQuery.data ?? []),
    [prioridadesQuery.data],
  );
  const tipoOperacionCodigoMap = useMemo(
    () => buildIdToCodigoMap(tiposOperacionQuery.data ?? []),
    [tiposOperacionQuery.data],
  );
  const tipoNombreMap = useMemo(
    () => new Map((tiposQuery.data ?? []).map((tipo) => [tipo.id, tipo.nombre])),
    [tiposQuery.data],
  );

  if (ticketQuery.isLoading) return <DetailSkeleton />;
  if (ticketQuery.isError || !ticketQuery.data) {
    return (
      <ErrorState
        message="No se pudo cargar el ticket."
        onRetry={() => {
          ticketQuery.refetch().catch(() => {});
        }}
      />
    );
  }

  const ticket = ticketQuery.data;
  const estadoCodigo = estadoCodigoMap.get(ticket.estadoId);

  return (
    <div className="flex flex-col gap-6">
      <TicketHeader
        ticket={ticket}
        estadoCodigo={estadoCodigo}
        prioridadCodigo={prioridadCodigoMap.get(ticket.prioridadId)}
        tipoNombre={tipoNombreMap.get(ticket.tipoId)}
      />

      <div className="flex flex-wrap items-center gap-3">
        {estadoCodigo && (
          <TicketTransitionControl
            estadoActualCodigo={estadoCodigo}
            onTransicionar={(nuevoEstadoCodigo) => transicionarMutation.mutate({ nuevoEstadoCodigo })}
            isSubmitting={transicionarMutation.isPending}
          />
        )}
        <TicketAssignControl
          usuarios={usuariosQuery.data ?? []}
          asignadoActualId={ticket.asignadoId}
          onAsignar={(asignadoId) => asignarMutation.mutate({ asignadoId })}
          isSubmitting={asignarMutation.isPending}
        />
        <Can permiso="ticket:editar">
          <Button variant="outline" size="sm" onClick={() => setEditando((v) => !v)}>
            {editando ? "Cancelar edición" : "Editar"}
          </Button>
        </Can>
      </div>

      {editando && (
        <TicketEditForm
          defaultValues={{
            titulo: ticket.titulo,
            descripcion: ticket.descripcion ?? "",
            prioridadId: ticket.prioridadId,
          }}
          prioridades={prioridadesQuery.data ?? []}
          onSubmit={(values) => {
            editarMutation.mutate(values);
            setEditando(false);
          }}
          onCancel={() => setEditando(false)}
          isSubmitting={editarMutation.isPending}
        />
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Actividad</h2>
        {timelineQuery.isLoading ? (
          <DetailSkeleton />
        ) : (
          <TicketTimeline operaciones={timelineQuery.data ?? []} tipoOperacionCodigoMap={tipoOperacionCodigoMap} />
        )}
      </section>

      <Can permiso="ticket:comentar">
        <TicketCommentForm
          onSubmit={(values) => comentarMutation.mutate(values)}
          isSubmitting={comentarMutation.isPending}
        />
      </Can>

      <TicketAttachmentUpload
        onUpload={(file) => adjuntarMutation.mutate(file)}
        isUploading={adjuntarMutation.isPending}
      />
    </div>
  );
}
