"use client";

/**
 * TicketCreateDialog — modal para crear un ticket general (R-M1 / T1.8),
 * abierto desde el botón "Nuevo ticket" de la lista universal `/tickets`
 * (conversión a modal, feat/ui-premium-educandow — antes ruta dedicada
 * `/tickets/nuevo`, revisión de ADR-1). Gate `ticket:crear` lo aplica el
 * caller (`TicketsListView`, vía `<Can>`).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTiposTicket, usePrioridades } from "../hooks/use-catalogos";
import { useCrearTicket } from "../hooks/use-ticket-mutations";
import { TicketCreateForm } from "./ticket-create-form";
import type { CrearTicketDto } from "../types";

export function TicketCreateDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  // B2: este es el alta genérica alcanzada desde el botón "Nuevo ticket" de
  // la lista universal `/tickets` — el resto de los módulos tienen su propia
  // alta dedicada (COMPRAS: CompraCreateDialog; EDILICIA: ReparacionCreateDialog;
  // EQUIPOS: TicketSoporteCreateDialog, todas sin selector de tipo). El único
  // alta con selector de tipo libre es esta, y corresponde al soporte técnico
  // general → se filtra a TICKETS (renombrado desde SOPORTE, WU-7.2) para
  // respetar la separación estricta por módulo (no permitir elegir un tipo
  // de COMPRAS/EDILICIA/EQUIPOS acá).
  const tiposQuery = useTiposTicket("TICKETS");
  const prioridadesQuery = usePrioridades();
  const crearMutation = useCrearTicket();

  function handleSubmit(dto: CrearTicketDto) {
    crearMutation.mutate(dto, {
      onSuccess: (ticket) => {
        setOpen(false);
        router.push(`/tickets/${ticket.id}`);
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nuevo ticket
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo ticket</DialogTitle>
        </DialogHeader>
        <TicketCreateForm
          tipos={tiposQuery.data ?? []}
          prioridades={prioridadesQuery.data ?? []}
          onSubmit={handleSubmit}
          isSubmitting={crearMutation.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
