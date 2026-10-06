"use client";

/**
 * TicketPdfButton — "Descargar PDF" de la ficha del ticket.
 *
 * Sin gate de permiso propio: `GET /tickets/:id/pdf` exige la misma acción y
 * el mismo scope de filas que el detalle, así que quien llegó a ver esta
 * pantalla ya puede pedirlo. El PDF nunca incluye comentarios internos,
 * aunque la pantalla se los muestre a quien tiene `TICKETS:OBSERVAR`.
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
