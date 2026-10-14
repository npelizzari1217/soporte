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
 * `GET /tickets/:id/tareas` lo puede quien ve el ticket (`TICKETS:VER_TODOS`,
 * solicitante o técnico de una tarea), pero el listado de reparaciones lo ve
 * cualquiera con `EDILICIA:LECTURA`. Para no dejar a ese lector sin checklist,
 * si el pedido falla se muestran de solo lectura las `subtareas` que ya trae
 * `GET /reparaciones`.
 */
import { useState, type ReactNode } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useCan } from "@/shared/hooks/use-can";
import { useTicket } from "@/features/tickets/hooks/use-ticket";
import { TicketTareas } from "@/features/tickets/components/ticket-tareas";
import type { SubtareaEdilicia } from "../types";

const INVALIDAR_LISTADO = [["reparaciones"]] as const;

export interface SubtareasDialogProps {
  ticketId: string;
  trigger: ReactNode;
  numero: string;
  /** Embebidas en `GET /reparaciones`: respaldo de solo lectura. */
  subtareas?: SubtareaEdilicia[];
}

function SubtareasSoloLectura({ subtareas }: { subtareas: SubtareaEdilicia[] }) {
  if (subtareas.length === 0) return <p className="text-sm text-muted-foreground">Sin tareas todavía.</p>;
  return (
    <ul className="flex flex-col gap-2" aria-label="Tareas (solo lectura)">
      {subtareas.map((subtarea) => (
        <li key={subtarea.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
          {subtarea.completada ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          ) : (
            <Circle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
          <span className={subtarea.completada ? "text-sm text-muted-foreground line-through" : "text-sm text-foreground"}>
            {subtarea.descripcion}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SubtareasDialog({ ticketId, trigger, numero, subtareas = [] }: SubtareasDialogProps) {
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
          respaldoSiFalla={<SubtareasSoloLectura subtareas={subtareas} />}
        />
      </DialogContent>
    </Dialog>
  );
}
