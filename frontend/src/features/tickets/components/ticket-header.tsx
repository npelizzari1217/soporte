"use client";

/**
 * TicketHeader — cabecera del detalle (R-M1: numero, titulo, estado,
 * prioridad, tipo, ciclo, SLA). PRESENTATIONAL — recibe el ticket +
 * catálogos ya resueltos, sin fetch propio.
 *
 * Solicitante/asignado muestran NOMBRE (no ID crudo) — resueltos batch por
 * el backend (`solicitanteNombre`/`asignadoNombre`, sdd/beta-frontend/
 * backend-gaps item 2). `null` = usuario no resuelto (removido del tenant)
 * → fallback al ID crudo, mejor que no mostrar nada.
 *
 * SLA (`slaVenceAt`/`vencido`, item 2 del mismo batch) — antes gap
 * documentado, ahora expuesto por `toTicketResponseDto`.
 */
import { StatusBadge, type TicketEstado } from "@/components/ui/status-badge";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { Badge } from "@/components/ui/badge";
import { formatearInstante } from "@/shared/lib/formato-fecha";
import type { Ticket } from "../types";

export interface TicketHeaderProps {
  ticket: Ticket;
  estadoCodigo?: string;
  prioridadCodigo?: string;
  tipoNombre?: string;
  /**
   * WU9.3 (gateo de UI, ADR-C5 backend): computado en el CONTAINER con
   * `useCan("CSAT:LECTURA")` — este componente es PRESENTATIONAL, no
   * resuelve permisos por su cuenta. Default `false`: sin el flag explícito
   * no se muestra el bloque, aunque `ticket.csatPuntaje` venga presente.
   */
  puedeVerCsat?: boolean;
}

/** Nombre completo o fallback al ID crudo si el backend no pudo resolverlo. */
function nombreCompleto(nombre: string | null, apellido: string | null, idFallback: string): string {
  if (nombre && apellido) return `${nombre} ${apellido}`;
  return idFallback;
}

export function TicketHeader({
  ticket,
  estadoCodigo,
  prioridadCodigo,
  tipoNombre,
  puedeVerCsat = false,
}: TicketHeaderProps) {
  const muestraCsat = puedeVerCsat && ticket.csatPuntaje !== undefined;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{ticket.numero}</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{ticket.titulo}</h1>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge estado={(estadoCodigo as TicketEstado) ?? "NUEVO"} />
          <PriorityBadge prioridad={prioridadCodigo ?? "-"} />
          {ticket.slaVenceAt && (
            <Badge variant={ticket.vencido ? "destructive" : "success"}>
              {ticket.vencido ? "SLA vencido" : "SLA al día"}
            </Badge>
          )}
        </div>
      </div>

      {ticket.descripcion && <p className="text-sm text-foreground">{ticket.descripcion}</p>}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Tipo</dt>
          <dd className="text-foreground">{tipoNombre ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Solicitante</dt>
          <dd className="text-foreground">
            {nombreCompleto(ticket.solicitanteNombre, ticket.solicitanteApellido, ticket.solicitanteId)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Asignado</dt>
          <dd className="text-foreground">
            {ticket.asignadoId
              ? nombreCompleto(ticket.asignadoNombre, ticket.asignadoApellido, ticket.asignadoId)
              : "Sin asignar"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {ticket.slaVenceAt ? "SLA vence" : "Creado"}
          </dt>
          {/*
           * Ticket.slaVenceAt / createdAt son @db.Timestamptz — instante.
           * `formatearInstante` (con hora) a propósito: antes se usaba
           * `Intl.DateTimeFormat("es-AR")` sin opciones, que le comía la hora
           * a un vencimiento — el usuario no podía saber si el SLA vence a
           * las 09:00 o a las 23:00.
           */}
          <dd className="text-foreground">
            {formatearInstante(ticket.slaVenceAt ?? ticket.createdAt)}
          </dd>
        </div>
      </dl>

      {muestraCsat && (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
          <p className="font-medium text-foreground">
            Satisfacción: {ticket.csatPuntaje} / 5
          </p>
          {ticket.csatComentario && (
            <p className="mt-1 text-muted-foreground">&ldquo;{ticket.csatComentario}&rdquo;</p>
          )}
        </div>
      )}
    </div>
  );
}
