"use client";

/**
 * TicketBorrarButton — "Borrar" del detalle del ticket (odd/permisos-por-tipo-ticket, S8), con
 * confirmación. El detalle lo monta solo con `BORRADO` sobre el tipo del ticket; decide el backend
 * (403 sin la acción, 422 si hay tareas pendientes o compras vinculadas, con un mensaje que dice
 * qué resolver y que llega como toast).
 *
 * Al borrar navega al listado: el ticket deja de existir para todos salvo ADMINISTRADOR y ROOT, que
 * lo encuentran en el filtro "Borrados".
 */
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useBorrarTicket } from "../hooks/use-ticket-mutations";

export interface TicketBorrarButtonProps {
  ticketId: string;
  numero: string;
}

export function TicketBorrarButton({ ticketId, numero }: TicketBorrarButtonProps) {
  const router = useRouter();
  const borrar = useBorrarTicket(ticketId);

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" size="sm" variant="destructive" isLoading={borrar.isPending}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Borrar
        </Button>
      }
      title={`Borrar el ticket ${numero}`}
      description="El ticket deja de verse en listados, exportaciones y métricas. Sus adjuntos, comentarios e historial se conservan, y un administrador puede recuperarlo."
      confirmLabel="Borrar"
      confirmVariant="destructive"
      isConfirming={borrar.isPending}
      onConfirm={() => borrar.mutate(undefined, { onSuccess: () => router.push("/tickets") })}
    />
  );
}
