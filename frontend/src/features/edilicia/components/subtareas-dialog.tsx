"use client";

/**
 * SubtareasDialog — tareas de una reparación, disparado por fila en
 * `ReparacionesList` (ADR-1: `/edilicia` sin ruta de detalle).
 *
 * Desde odd/tareas-con-tecnico (T6) monta el mismo `TicketTareas` que el detalle
 * del ticket, keyed por el `ticketId` de la reparación, sobre las rutas
 * genéricas `/tickets/:id/tareas`. Los botones siguen CA3/CA4 (responsable,
 * ADMINISTRADOR o ROOT con `MODIFICACION` sobre el tipo de la reparación;
 * completa también el técnico de la tarea).
 *
 * El responsable sale de `GET /tickets/:id`, que decide con el mismo alcance que
 * el listado de reparaciones (`LECTURA` sobre el tipo y regla de fila,
 * odd/permisos-por-tipo-ticket): quien ve la fila ve el ticket. Si la lectura
 * falla, queda desconocido y `permisos-tareas.ts` aplica su regla para ese caso.
 * Cada mutación invalida `["reparaciones"]`, porque el avance del listado se
 * calcula sobre estas tareas. Con el ticket RESUELTO, CERRADO o CANCELADO, quien no es
 * administrador las ve sin botones (odd/cerrado-solo-comentarios).
 */
import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { motivoTareasSoloLectura } from "@/features/tickets/lib/permisos-tareas";
import { useTicket } from "@/features/tickets/hooks/use-ticket";
import { TicketTareas } from "@/features/tickets/components/ticket-tareas";
import { useSession } from "@/shared/hooks/use-session";

const INVALIDAR_LISTADO = [["reparaciones"]] as const;

export interface SubtareasDialogProps {
  ticketId: string;
  /** Tipo del ticket de la reparación: gestionar tareas exige `MODIFICACION` sobre él. */
  tipoId: string;
  trigger: ReactNode;
  numero: string;
  /** Código del estado del ticket; `undefined` mientras el catálogo no resolvió. */
  estadoCodigo: string | undefined;
  /** `bloqueada` de la fila del listado (compra activa vinculada). */
  bloqueada: boolean;
}

export function SubtareasDialog({ ticketId, tipoId, trigger, numero, estadoCodigo, bloqueada }: SubtareasDialogProps) {
  const [open, setOpen] = useState(false);
  const { esAdminCliente } = useSession();
  const ticketQuery = useTicket(ticketId, open);
  const asignadoId = ticketQuery.data ? ticketQuery.data.asignadoId : undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Subtareas — {numero}</DialogTitle>
        </DialogHeader>
        <TicketTareas
          ticketId={ticketId}
          asignadoId={asignadoId}
          tipoId={tipoId}
          invalidarTambien={INVALIDAR_LISTADO}
          motivoSoloLectura={motivoTareasSoloLectura(estadoCodigo, bloqueada, esAdminCliente)}
        />
      </DialogContent>
    </Dialog>
  );
}
