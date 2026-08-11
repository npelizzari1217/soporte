"use client";

/**
 * TicketCreateView — CONTAINER client component montado por `/tickets/nuevo`
 * (ADR-1). Gate `ticket:crear` (`<Can>`, ADR-4) — el backend re-valida vía
 * `@RequirePermissions('ticket:crear')` de todos modos.
 */
import { useRouter } from "next/navigation";
import { useTiposTicket, usePrioridades } from "../hooks/use-catalogos";
import { useCrearTicket } from "../hooks/use-ticket-mutations";
import { Can } from "@/components/shared/can";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/error-state";
import { TicketCreateForm } from "./ticket-create-form";
import type { CrearTicketDto } from "../types";

export function TicketCreateView() {
  const router = useRouter();
  // B2: este es el alta genérica alcanzada desde el botón "Nuevo ticket" de
  // la lista universal `/tickets` — el resto de los módulos tienen su propia
  // alta dedicada (COMPRAS: CompraCreateDialog; EDILICIA: ReparacionCreateDialog;
  // EQUIPOS: TicketSoporteCreateDialog, todas sin selector de tipo). El único
  // alta con selector de tipo libre es esta, y corresponde al soporte técnico
  // general → se filtra a SOPORTE para respetar la separación estricta por
  // módulo (no permitir elegir un tipo de COMPRAS/EDILICIA/EQUIPOS acá).
  const tiposQuery = useTiposTicket("SOPORTE");
  const prioridadesQuery = usePrioridades();
  const crearMutation = useCrearTicket();

  function handleSubmit(dto: CrearTicketDto) {
    crearMutation.mutate(dto, {
      onSuccess: (ticket) => router.push(`/tickets/${ticket.id}`),
    });
  }

  return (
    <Can permiso="ticket:crear" fallback={<ErrorState message="No tenés permiso para crear tickets." />}>
      <div>
        <PageHeader title="Nuevo ticket" />
        <TicketCreateForm
          tipos={tiposQuery.data ?? []}
          prioridades={prioridadesQuery.data ?? []}
          onSubmit={handleSubmit}
          isSubmitting={crearMutation.isPending}
        />
      </div>
    </Can>
  );
}
