"use client";

/**
 * TicketCreateDialog — modal para crear un ticket general (R-M1 / T1.8),
 * abierto desde el botón "Nuevo ticket" de la lista universal `/tickets`
 * (conversión a modal, feat/ui-premium-educandow — antes ruta dedicada
 * `/tickets/nuevo`, revisión de ADR-1). El caller (`TicketsListView`) lo
 * muestra a quien tiene `ALTAS` en algún tipo de un módulo con alta de tipo, y el
 * selector ofrece los tipos con alta manual (TICKETS y EDILICIA, salvo PREVENTIVO)
 * donde tiene `ALTAS` (odd/ticket-unificado, S6; odd/permisos-por-tipo-ticket, S6).
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
import { admiteAltaManual } from "../lib/alta-manual";
import { TicketCreateForm } from "./ticket-create-form";
import type { CrearTicketDto } from "../types";

export function TicketCreateDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  // Todo ticket tiene los mismos campos (odd/ticket-unificado, S1), así que esta alta ofrece
  // cualquier tipo con alta manual: los de TICKETS y los de EDILICIA salvo PREVENTIVO, que lo
  // genera solo el barrido. COMPRAS y EQUIPOS siguen con su alta propia (`CompraCreateDialog`,
  // `TicketSoporteCreateDialog`): el backend responde 422 a un tipo de esos módulos.
  const tiposQuery = useTiposTicket();
  // Solo los tipos con Crear: el backend responde 403 al alta de cualquier otro (S6).
  const tiposConAlta = usePermisosPorTipo().tiposCon(
    (tiposQuery.data ?? []).filter(admiteAltaManual),
    "ALTAS",
  );
  const prioridadesQuery = usePrioridades();
  // El catálogo de sectores se pide recién al abrir el modal.
  const sectoresQuery = useSectores(open);
  const crearMutation = useCrearTicket();

  // `ALTAS` en un módulo puede ser solo sobre un tipo dado de baja (que el catálogo no trae) o sobre
  // PREVENTIVO: sin un tipo elegible el botón abriría un formulario imposible de enviar.
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
