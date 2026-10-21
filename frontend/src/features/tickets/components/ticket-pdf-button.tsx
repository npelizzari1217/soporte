"use client";

/**
 * TicketPdfButton — "Descargar PDF" de la ficha del ticket.
 *
 * El contenedor lo monta solo con `IMPRESION` sobre el tipo del ticket: es lo
 * que exige `GET /tickets/:id/pdf` además de ver el ticket
 * (odd/permisos-por-tipo-ticket, D5 c). El PDF nunca incluye comentarios
 * internos, aunque la pantalla se los muestre a quien tiene `OBSERVAR`.
 */
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDescargarPdfTicket } from "../hooks/use-descargar-pdf-ticket";

export interface TicketPdfButtonProps {
  ticketId: string;
  numero: string;
}

export function TicketPdfButton({ ticketId, numero }: TicketPdfButtonProps) {
  const descarga = useDescargarPdfTicket({ ticketId, numero });

  return (
    <Button
      type="button"
      variant="outline"
      isLoading={descarga.isPending}
      onClick={() => descarga.mutate()}
    >
      {!descarga.isPending && <FileText className="mr-2 h-4 w-4" aria-hidden />}
      Descargar PDF
    </Button>
  );
}
