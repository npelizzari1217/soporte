"use client";

/**
 * TicketDetailView — CONTAINER client component montado por `/tickets/:id`
 * (ADR-1). Orquesta detalle + timeline + acciones gateadas por permiso
 * (R-M1 / T1.6-T1.13).
 *
 * Cada acción se ofrece según la acción concedida sobre el TIPO de este ticket
 * (odd/permisos-por-tipo-ticket, S6, D5 c), la misma que exige el backend:
 * Editar `MODIFICACION`, Estado `TRANSICIONAR`, Responsable `ASIGNAR`,
 * comentar `COMENTAR`, comentario interno `OBSERVAR`, PDF `IMPRESION`, adjuntar
 * `ALTAS` o `MODIFICACION`, gestionar tareas `MODIFICACION`.
 */
import { useMemo, type ReactNode } from "react";
import { useTicket, useTicketTimeline } from "../hooks/use-ticket";
import { useTiposTicket, usePrioridades, useEstados, useTiposOperacion } from "../hooks/use-catalogos";
import { useTecnicosAsignables } from "../hooks/use-tecnicos-asignables";
import { useEquipoDeTicket } from "../hooks/use-equipo-de-ticket";
import {
  useAsignarEnProceso,
  useAsignarTicket,
  useComentar,
  useEditarTicket,
  useSubirAdjunto,
  useTransicionarEstado,
} from "../hooks/use-ticket-mutations";
import { buildIdToCodigoMap } from "../lib/catalog-map";
import { puedeAsignarYPonerEnProceso, puedeEditarDatos, puedeReasignar } from "../lib/estado-transitions";
import { motivoTareasSoloLectura } from "../lib/permisos-tareas";
import { useCan } from "@/shared/hooks/use-can";
import { useSession } from "@/shared/hooks/use-session";
import { usePermisosPorTipo } from "@/shared/hooks/use-permisos-por-tipo";
import type { AccionTipoTicket } from "@/shared/auth/permisos-por-tipo";
import { DetailSkeleton } from "@/components/shared/skeletons";
import { ErrorState } from "@/components/shared/error-state";
import { TicketHeader } from "./ticket-header";
import { TicketTimeline } from "./ticket-timeline";
import { TicketCommentForm } from "./ticket-comment-form";
import { TicketTransitionControl } from "./ticket-transition-control";
import { TicketResponsableControl } from "./ticket-responsable-control";
import { TicketEditDialog } from "./ticket-edit-dialog";
import { TicketAttachmentUpload } from "./ticket-attachment-upload";
import { TicketEquipoMantenimientoCard } from "./ticket-equipo-mantenimiento-card";
import { TicketPdfButton } from "./ticket-pdf-button";
import { TicketTareas } from "./ticket-tareas";

/** Código del tipo de ticket que habilita la consulta del equipo vinculado (satélite `ticket_soporte`). */
const TIPO_SOPORTE_CODIGO = "SOPORTE";

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
  const { puedeEnTipo } = usePermisosPorTipo();
  // Sin ticket todavía no hay tipo: nada se ofrece hasta saberlo.
  const tipoId = ticketQuery.data?.tipoId;
  const puede = (accion: AccionTipoTicket): boolean =>
    tipoId !== undefined && puedeEnTipo(tipoId, accion);
  const puedeAsignar = puede("ASIGNAR");
  const puedeTransicionar = puede("TRANSICIONAR");
  const puedeModificar = puede("MODIFICACION");
  // WU9.3: el backend ya gatea csatPuntaje/csatComentario por payload
  // (ADR-C5); esta bandera es defensa en profundidad del lado UI.
  const puedeVerCsat = useCan("CSAT:LECTURA");
  const { isGlobalAdmin } = useSession();
  const tecnicosQuery = useTecnicosAsignables(ticketId, puedeAsignar);

  // Solo consulta el equipo vinculado cuando el tipo del ticket ya se resolvió a SOPORTE
  // (los demás tipos no tienen satélite `ticket_soporte`, GET /soporte/:ticketId no aplica).
  const tipoCodigoMap = useMemo(() => buildIdToCodigoMap(tiposQuery.data ?? []), [tiposQuery.data]);
  const tipoCodigo = ticketQuery.data ? tipoCodigoMap.get(ticketQuery.data.tipoId) : undefined;
  const esTicketSoporte = tipoCodigo === TIPO_SOPORTE_CODIGO;
  const equipoDeTicketQuery = useEquipoDeTicket(ticketId, esTicketSoporte);

  const comentarMutation = useComentar(ticketId);
  const transicionarMutation = useTransicionarEstado(ticketId);
  const asignarEnProcesoMutation = useAsignarEnProceso(ticketId);
  const reasignarMutation = useAsignarTicket(ticketId);
  const editarMutation = useEditarTicket(ticketId);
  const adjuntarMutation = useSubirAdjunto(ticketId);

  const estadoCodigoMap = useMemo(() => buildIdToCodigoMap(estadosQuery.data ?? []), [estadosQuery.data]);
  const prioridadCodigoMap = useMemo(
    () => buildIdToCodigoMap(prioridadesQuery.data ?? []),
    [prioridadesQuery.data],
  );
  const tipoOperacionCodigoMap = useMemo(
    () => buildIdToCodigoMap(tiposOperacionQuery.data ?? []),
    [tiposOperacionQuery.data],
  );
  const tipoModuloMap = useMemo(
    () => new Map((tiposQuery.data ?? []).map((tipo) => [tipo.id, tipo.modulo as string])),
    [tiposQuery.data],
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
  // Bloqueo de edición por estado (mirror backend): una vez EN_PROCESO+, solo
  // ROOT edita. Si el estado aún no se resolvió (catálogo cargando), no bloquea.
  const edicionPermitida = estadoCodigo ? puedeEditarDatos(estadoCodigo, isGlobalAdmin) : true;
  // La ubicación general no se muestra ni se carga en los tickets de Edilicia,
  // que tienen la suya propia (odd/ubicacion-sector-ticket, CA2). Mientras el
  // catálogo de tipos no cargó (o falló) el módulo es desconocido y queda oculta:
  // el PATCH la omite y el backend no la toca. Con el catálogo cargado, un tipo
  // ausente es un tipo desactivado (el catálogo trae solo los activos) y se
  // muestra (CA1): los tipos de Edilicia son del sistema y no se desactivan.
  const modulo = tipoModuloMap.get(ticket.tipoId);
  const mostrarUbicacion = tiposQuery.isSuccess && modulo !== "EDILICIA";

  return (
    <div className="flex flex-col gap-6">
      <TicketHeader
        ticket={ticket}
        estadoCodigo={estadoCodigo}
        prioridadCodigo={prioridadCodigoMap.get(ticket.prioridadId)}
        tipoNombre={tipoNombreMap.get(ticket.tipoId)}
        mostrarUbicacion={mostrarUbicacion}
        puedeVerCsat={puedeVerCsat}
      />

      {esTicketSoporte && equipoDeTicketQuery.data?.equipo && (
        <TicketEquipoMantenimientoCard equipo={equipoDeTicketQuery.data.equipo} />
      )}

      {/*
       * Acciones agrupadas (odd/tasks/acciones-ticket-agrupadas, S3): cada grupo tiene título,
       * y dentro cada control lleva su etiqueta y su botón. Un grupo solo se monta si el usuario
       * puede hacer algo en él; el gateo fino sigue dentro de cada control.
       */}
      <section
        aria-labelledby="acciones-titulo"
        className="rounded-lg border border-border bg-seccion-acciones p-6"
      >
        <h2 id="acciones-titulo" className="mb-4 text-sm font-semibold text-foreground">
          Acciones
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          {puedeAsignar && estadoCodigo && puedeReasignar(estadoCodigo) && (
            <GrupoAccion titulo="Responsable">
              <TicketResponsableControl
                // `key` por modo: al pasar de arranque a cambio el control se remonta y la
                // elección anterior no se arrastra al botón nuevo.
                key={puedeAsignarYPonerEnProceso(estadoCodigo) ? "arranque" : "cambio"}
                tecnicos={tecnicosQuery.data ?? []}
                modo={puedeAsignarYPonerEnProceso(estadoCodigo) ? "arranque" : "cambio"}
                onAsignarEnProceso={(asignadoId) => asignarEnProcesoMutation.mutate({ asignadoId })}
                onReasignar={(asignadoId) => reasignarMutation.mutate({ asignadoId })}
                isSubmitting={asignarEnProcesoMutation.isPending || reasignarMutation.isPending}
                puedeAsignar={puedeAsignar}
                puedeTransicionar={puedeTransicionar}
              />
            </GrupoAccion>
          )}
          {puedeTransicionar && estadoCodigo && (
            <GrupoAccion titulo="Estado">
              <TicketTransitionControl
                estadoActualCodigo={estadoCodigo}
                onTransicionar={(nuevoEstadoCodigo) => transicionarMutation.mutate({ nuevoEstadoCodigo })}
                isSubmitting={transicionarMutation.isPending}
                puedeTransicionar={puedeTransicionar}
              />
            </GrupoAccion>
          )}
          <GrupoAccion titulo="Ticket">
            <div className="flex flex-wrap items-center gap-2">
              {puedeModificar && edicionPermitida ? (
                <TicketEditDialog
                  defaultValues={{
                    titulo: ticket.titulo,
                    descripcion: ticket.descripcion ?? "",
                    prioridadId: ticket.prioridadId,
                    ubicacion: ticket.ubicacion ?? "",
                    sectorId: ticket.sectorId ?? "",
                  }}
                  // `undefined` mientras la query no resolvió (cargando o error):
                  // `TicketEditForm` lo necesita para no etiquetar por error un
                  // valor activo como "dado de baja" (ver JSDoc de la prop).
                  prioridades={prioridadesQuery.data}
                  sectorNombre={ticket.sectorNombre}
                  mostrarUbicacion={mostrarUbicacion}
                  onSubmit={(dto) => editarMutation.mutate(dto)}
                  isSubmitting={editarMutation.isPending}
                />
              ) : null}
              {puede("IMPRESION") && <TicketPdfButton ticketId={ticket.id} numero={ticket.numero} />}
            </div>
            {puedeModificar && !edicionPermitida && (
              <p className="text-xs text-muted-foreground">En proceso: solo ROOT puede editar.</p>
            )}
          </GrupoAccion>
        </div>
      </section>

      {/*
       * Tareas y Actividad son tarjetas como Acciones, cada una con su fondo (odd/detalle-ticket-legible,
       * S1, S3). Tareas en cualquier tipo de ticket (odd/tareas-con-tecnico, T6; CA1).
       */}
      <section
        aria-labelledby="tareas-titulo"
        className="rounded-lg border border-border bg-seccion-tareas p-6"
      >
        <h2 id="tareas-titulo" className="mb-4 text-sm font-semibold text-foreground">
          Tareas
        </h2>
        <TicketTareas
          ticketId={ticket.id}
          asignadoId={ticket.asignadoId}
          tipoId={ticket.tipoId}
          // El detalle no conoce el bloqueo por compra (es de Edilicia): solo el estado.
          motivoSoloLectura={motivoTareasSoloLectura(estadoCodigo, false)}
        />
      </section>

      {/*
       * Actividad: el formulario de comentario y el adjunto van ARRIBA de la línea de tiempo, que se
       * muestra de lo más nuevo a lo más viejo (S2): se escribe donde se lee lo último.
       */}
      <section
        aria-labelledby="actividad-titulo"
        className="flex flex-col gap-4 rounded-lg border border-border bg-seccion-actividad p-6"
      >
        <h2 id="actividad-titulo" className="text-sm font-semibold text-foreground">
          Actividad
        </h2>
        {puede("COMENTAR") && (
          <TicketCommentForm
            onSubmit={(values) => comentarMutation.mutate(values)}
            isSubmitting={comentarMutation.isPending}
            puedeObservar={puede("OBSERVAR")}
          />
        )}
        {(puede("ALTAS") || puedeModificar) && (
          <TicketAttachmentUpload
            onUpload={(file) => adjuntarMutation.mutate(file)}
            isUploading={adjuntarMutation.isPending}
          />
        )}
        <div className="border-t border-border pt-4">
          {timelineQuery.isLoading ? (
            <DetailSkeleton />
          ) : (
            <TicketTimeline
              operaciones={timelineQuery.data ?? []}
              tipoOperacionCodigoMap={tipoOperacionCodigoMap}
            />
          )}
        </div>
      </section>
    </div>
  );
}

/** Un grupo de la tarjeta "Acciones": título corto y, debajo, el control con su etiqueta y su botón. */
function GrupoAccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      {children}
    </div>
  );
}
