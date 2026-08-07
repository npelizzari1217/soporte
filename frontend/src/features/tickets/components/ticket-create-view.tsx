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
  const tiposQuery = useTiposTicket();
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
