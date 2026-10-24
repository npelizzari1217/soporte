"use client";

/**
 * VincularCompraDialog — panel de compras vinculadas a un ticket, disparado por fila en
 * `ReparacionesList` (ADR-1: `/edilicia` sin ruta de detalle). El contenido es `TicketCompras`, el
 * mismo que muestra el detalle del ticket, sobre `/tickets/:ticketId/compras` (odd/ticket-unificado).
 *
 * Gate, espejo del backend (odd/ticket-unificado, S4; JD-A-001, JD-B-004):
 * - La celda `COMPRAS:LECTURA` es la puerta: sin ella `GET /tickets/:id/compras` responde 403
 *   (L19), así que no hay panel. El chip «Bloqueada» de la fila se sigue viendo.
 * - Vincular y desvincular piden además `MODIFICACION` sobre el tipo del ticket. Con
 *   `COMPRAS:LECTURA` y sin `MODIFICACION` el botón dice «Ver compras» y el panel no tiene acciones.
 *   Ni `ALTAS` sobre el tipo ni `EDILICIA:BORRADO` habilitan nada.
 *
 * Son controles de EXPERIENCIA, nunca de seguridad: un `curl` directo sin estos permisos recibe 403.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCan } from "@/shared/hooks/use-can";
import { TicketCompras } from "@/features/tickets/components/ticket-compras";

export interface VincularCompraDialogProps {
  /** Id del ticket de la fila. */
  ticketId: string;
  numero: string;
  /** `MODIFICACION` sobre el tipo del ticket de la fila (odd/ticket-unificado, S4). */
  puedeModificarEnTipo: boolean;
}

/**
 * Botón y panel de compras de una fila de Edilicia.
 *
 * @param props Ticket de la fila y su permiso de modificación.
 * @returns El botón con su diálogo, o nada sin `COMPRAS:LECTURA`.
 */
export function VincularCompraDialog({ ticketId, numero, puedeModificarEnTipo }: VincularCompraDialogProps) {
  const [open, setOpen] = useState(false);
  const puedeLeerCompras = useCan("COMPRAS:LECTURA");
  if (!puedeLeerCompras) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {puedeModificarEnTipo ? "Gestionar compras" : "Ver compras"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Compras vinculadas — {numero}</DialogTitle>
        </DialogHeader>
        {/* Montado solo con el diálogo abierto: la grilla no pide las compras de cada fila. */}
        {open && <TicketCompras ticketId={ticketId} puedeGestionar={puedeModificarEnTipo} />}
      </DialogContent>
    </Dialog>
  );
}
