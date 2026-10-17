"use client";

/**
 * SubtareasDialog — tareas de una reparación, disparado por fila en
 * `ReparacionesList` (ADR-1: `/edilicia` sin ruta de detalle).
 *
 * Desde odd/tareas-con-tecnico (T6) monta el mismo `TicketTareas` que el detalle
 * del ticket, keyed por el `ticketId` de la reparación, sobre las rutas
 * genéricas `/tickets/:id/tareas`. Los botones siguen CA3/CA4 (responsable,
 * ADMINISTRADOR o ROOT con `EDILICIA:MODIFICACION`; completa también el técnico
 * de la tarea), no los viejos `EDILICIA:ALTAS`/`MODIFICACION`/`BORRADO`.
 *
 * El responsable sale de `GET /tickets/:id`, que exige `TICKETS:LECTURA`. Sin
 * ese permiso, o si la lectura falla, queda desconocido y `permisos-tareas.ts`
 * aplica su regla para ese caso. Cada mutación invalida `["reparaciones"]`,
 * porque el avance del listado se calcula sobre estas tareas.
 *
 * `GET /tickets/:id/tareas` sigue el permiso de lectura del módulo del tipo
 * (odd/tareas-con-tecnico T12): un lector con `EDILICIA:LECTURA` lista las
 * tareas aunque no vea el ticket, igual que ve el listado de reparaciones. Por
 * eso el diálogo siempre usa el listado genérico, con el técnico de cada tarea.
 */
import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useCan } from "@/shared/hooks/use-can";
import { motivoTareasSoloLectura } from "@/features/tickets/lib/permisos-tareas";
import { useTicket } from "@/features/tickets/hooks/use-ticket";
import { TicketTareas } from "@/features/tickets/components/ticket-tareas";

const INVALIDAR_LISTADO = [["reparaciones"]] as const;

export interface SubtareasDialogProps {
  ticketId: string;
  trigger: ReactNode;
  numero: string;
  /** Código del estado del ticket; `undefined` mientras el catálogo no resolvió. */
  estadoCodigo: string | undefined;
  /** `bloqueada` de la fila del listado (compra activa vinculada). */
  bloqueada: boolean;
}

export function SubtareasDialog({ ticketId, trigger, numero, estadoCodigo, bloqueada }: SubtareasDialogProps) {
  const [open, setOpen] = useState(false);
  const puedeLeerTicket = useCan("TICKETS:LECTURA");
  const ticketQuery = useTicket(ticketId, open && puedeLeerTicket);
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
          modulo="EDILICIA"
          invalidarTambien={INVALIDAR_LISTADO}
          motivoSoloLectura={motivoTareasSoloLectura(estadoCodigo, bloqueada)}
        />
      </DialogContent>
    </Dialog>
  );
}
