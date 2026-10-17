"use client";

/**
 * TicketTimeline — línea de tiempo del ticket, de lo más nuevo a lo más viejo (R-M1 / T1.7:
 * CAMBIO_ESTADO, COMENTARIO, ASIGNACION, ADJUNTO). El backend YA filtra las
 * operaciones internas para actores sin `ticket:observar` — este componente
 * NO re-filtra, solo renderiza lo recibido y marca visualmente las internas
 * que sí llegan (viewer autorizado).
 */
import {
  CheckCircle2,
  HelpCircle,
  ListPlus,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Trash2,
  Undo2,
  UserCheck,
  UserCog,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatearInstante } from "@/shared/lib/formato-fecha";
import type { OperacionTicket } from "../types";

const TIPO_OPERACION_CONFIG: Record<string, { label: string; icon: typeof MessageSquare }> = {
  CAMBIO_ESTADO: { label: "Cambio de estado", icon: RefreshCw },
  COMENTARIO: { label: "Comentario", icon: MessageSquare },
  ASIGNACION: { label: "Asignación", icon: UserCheck },
  ADJUNTO: { label: "Adjunto", icon: Paperclip },
  // Tareas del ticket (odd/tareas-con-tecnico, T2/T6): la descripción trae el texto de la tarea.
  TAREA_CREADA: { label: "Tarea agregada", icon: ListPlus },
  TAREA_ASIGNADA: { label: "Técnico de tarea", icon: UserCog },
  TAREA_COMPLETADA: { label: "Tarea completada", icon: CheckCircle2 },
  TAREA_DESCOMPLETADA: { label: "Tarea descompletada", icon: Undo2 },
  TAREA_ELIMINADA: { label: "Tarea eliminada", icon: Trash2 },
};

export interface TicketTimelineProps {
  operaciones: OperacionTicket[];
  tipoOperacionCodigoMap: Map<string, string>;
}

export function TicketTimeline({ operaciones, tipoOperacionCodigoMap }: TicketTimelineProps) {
  if (operaciones.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin actividad todavía.</p>;
  }

  // Lo más nuevo arriba (odd/detalle-ticket-legible, S2): el backend manda ascendente y acá se
  // ordena por instante, sin confiar en el orden de llegada.
  const ordenadas = [...operaciones].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <ol className="flex flex-col gap-4">
      {ordenadas.map((operacion) => {
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
                {/* OperacionTicket.createdAt es @db.Timestamptz — instante. */}
                <span className="text-xs text-muted-foreground">{formatearInstante(operacion.createdAt)}</span>
              </div>
              {operacion.descripcion && <p className="text-sm text-foreground">{operacion.descripcion}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
