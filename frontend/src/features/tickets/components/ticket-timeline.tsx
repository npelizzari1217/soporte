"use client";

/**
 * TicketTimeline — lista cronológica de operaciones del ticket (R-M1 / T1.7:
 * CAMBIO_ESTADO, COMENTARIO, ASIGNACION, ADJUNTO). El backend YA filtra las
 * operaciones internas para actores sin `ticket:observar` — este componente
 * NO re-filtra, solo renderiza lo recibido y marca visualmente las internas
 * que sí llegan (viewer autorizado).
 */
import { MessageSquare, RefreshCw, UserCheck, Paperclip, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { OperacionTicket } from "../types";

const TIPO_OPERACION_CONFIG: Record<string, { label: string; icon: typeof MessageSquare }> = {
  CAMBIO_ESTADO: { label: "Cambio de estado", icon: RefreshCw },
  COMENTARIO: { label: "Comentario", icon: MessageSquare },
  ASIGNACION: { label: "Asignación", icon: UserCheck },
  ADJUNTO: { label: "Adjunto", icon: Paperclip },
};

export interface TicketTimelineProps {
  operaciones: OperacionTicket[];
  tipoOperacionCodigoMap: Map<string, string>;
}

export function TicketTimeline({ operaciones, tipoOperacionCodigoMap }: TicketTimelineProps) {
  if (operaciones.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin actividad todavía.</p>;
  }

  return (
    <ol className="flex flex-col gap-4">
      {operaciones.map((operacion) => {
        const codigo = tipoOperacionCodigoMap.get(operacion.tipoOperacionId);
        const config = (codigo && TIPO_OPERACION_CONFIG[codigo]) || { label: "Operación", icon: HelpCircle };
        const Icon = config.icon;

        return (
          <li key={operacion.id} className="flex gap-3">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{config.label}</span>
                {operacion.esInterno && (
                  <Badge variant="outline" className="text-[10px]">
                    Interno
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(
                    new Date(operacion.createdAt),
                  )}
                </span>
              </div>
              {operacion.descripcion && <p className="text-sm text-foreground">{operacion.descripcion}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
