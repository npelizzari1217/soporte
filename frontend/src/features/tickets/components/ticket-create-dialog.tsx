"use client";

/**
 * TicketCreateDialog — modal para crear un ticket general (R-M1 / T1.8),
 * abierto desde el botón "Nuevo ticket" de la lista universal `/tickets`
 * (conversión a modal, feat/ui-premium-educandow — antes ruta dedicada
 * `/tickets/nuevo`, revisión de ADR-1). El caller (`TicketsListView`) lo
 * muestra a quien tiene `ALTAS` en algún tipo de TICKETS, y el selector ofrece
 * solo esos tipos (odd/permisos-por-tipo-ticket, S6).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTiposTicket, usePrioridades } from "../hooks/use-catalogos";
import { useCrearTicket } from "../hooks/use-ticket-mutations";
import { useSectores } from "@/features/sectores/hooks/use-sectores";
import { usePermisosPorTipo } from "@/shared/hooks/use-permisos-por-tipo";
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
  // Solo los tipos con Crear: el backend responde 403 al alta de cualquier otro (S6).
  const tiposConAlta = usePermisosPorTipo().tiposCon(tiposQuery.data ?? [], "ALTAS");
  const prioridadesQuery = usePrioridades();
  // El catálogo de sectores se pide recién al abrir el modal.
  const sectoresQuery = useSectores(open);
  const crearMutation = useCrearTicket();

  // `ALTAS` en algún tipo de TICKETS puede ser solo sobre un tipo dado de baja, que el catálogo no
  // trae: sin un tipo elegible el botón abriría un formulario imposible de enviar.
  if (tiposQuery.isSuccess && tiposConAlta.length === 0) return null;

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
          tipos={tiposConAlta}
          prioridades={prioridadesQuery.data ?? []}
          sectores={sectoresQuery.data ?? []}
          onSubmit={handleSubmit}
          isSubmitting={crearMutation.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
