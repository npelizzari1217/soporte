"use client";

/**
 * useTicketForm — CONTAINER hook for ticket create/edit forms.
 *
 * ADR-3: UI effects (toast, modal close, rhf reset, setError) live here, NOT in the
 * pure mutation hooks (useCreateTicket / useUpdateTicket). This hook is the bridge
 * between the mutation layer and the presentation layer (TicketFormModal).
 *
 * ADR-6: `solicitanteId` is injected here from `useSession().user.sub` at submit time.
 * It is NEVER a form field — the user sees no selector for this.
 *
 * ADR-1: Server errors (ApiError) are form-level, not field-level. They surface as
 * `errors.root` banner + `notify.error` toast. Only Zod (client) errors are field-level.
 *
 * Edit mode — special 404 handling:
 *   If the ticket no longer exists (race condition or concurrent delete), the mutation
 *   returns 404. In this case we close the modal and invalidate the list so the stale
 *   row disappears, instead of showing a form-level error on a ghost ticket.
 *
 * Spec: tickets-ui §req Formulario de creación; §req Formulario de edición
 * Spec: ui-states-delta §req 422 inline; §req 404 cierra; §req onSuccess
 * Design: design.md §4 (Create/Edit flows), ADR-1, ADR-3, ADR-6
 */

import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/shared/hooks/use-session";
import { notify } from "@/shared/lib/notify";
import { mapApiError } from "@/shared/lib/map-api-error";
import { ApiError } from "@/shared/api/types";
import { queryKeys } from "@/shared/api/query-keys";
import { CreateTicketSchema, UpdateTicketSchema } from "../schemas";
import type { CreateTicketForm, UpdateTicketInput, TicketFormValues } from "../schemas";
import type { Ticket } from "../types";
import { useCreateTicket } from "./use-create-ticket";
import { useUpdateTicket } from "./use-update-ticket";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UseTicketFormOpts {
  onClose: () => void;
  /** Required when mode === 'edit'. Provides id for PATCH and defaultValues. */
  ticket?: Ticket;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Maps a Ticket entity to the UpdateTicketInput shape for RHF defaultValues.
 * Converts null → undefined for optional text fields (Zod optional, not nullable).
 */
function mapTicketToForm(t: Ticket): TicketFormValues {
  return {
    titulo: t.titulo,
    descripcion: t.descripcion ?? undefined,
    prioridadId: t.prioridadId,
    cicloId: t.cicloId ?? undefined,
    fechaVencimiento: t.fechaResolucion ?? undefined,
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useTicketForm(
  mode: "create" | "edit",
  opts: UseTicketFormOpts
) {
  const { user } = useSession();
  const qc = useQueryClient();

  // Both hooks are always called (Rules of Hooks — no conditional hook calls).
  // Only one is used per render based on `mode`.
  const createTicket = useCreateTicket();
  const updateTicket = useUpdateTicket();

  const isEdit = mode === "edit";

  // Single useForm backs both modes. The dual-schema resolver variance (Create vs
  // Update produce different shapes) is isolated to ONE documented cast below, so the
  // rest of the form — and `errors.<campo>.message` in TicketFormModal — stays typed.
  const form = useForm<TicketFormValues>({
    resolver: zodResolver(
      isEdit ? UpdateTicketSchema : CreateTicketSchema
    ) as Resolver<TicketFormValues>,
    defaultValues: isEdit && opts.ticket
      ? mapTicketToForm(opts.ticket)
      : {
          titulo: "",
          descripcion: undefined,
          tipoId: "",
          prioridadId: "",
          cicloId: undefined,
          fechaVencimiento: undefined,
        },
    mode: "onBlur",
  });

  // ─── Submit handler ────────────────────────────────────────────────────────

  async function onSubmit(values: TicketFormValues) {
    try {
      if (isEdit && opts.ticket) {
        // Edit mode: PATCH with UpdateTicketInput
        await updateTicket.mutateAsync({
          id: opts.ticket.id,
          dto: values as UpdateTicketInput,
        });
        notify.success("Ticket actualizado");
      } else {
        // Create mode: POST with CreateTicketInput (+ solicitanteId — ADR-6)
        await createTicket.mutateAsync({
          ...(values as CreateTicketForm),
          solicitanteId: user?.sub ?? "",
        });
        notify.success("Ticket creado");
      }
      form.reset();
      opts.onClose();
    } catch (err) {
      // Special case: 404 in edit mode means the ticket was deleted concurrently.
      // Close the modal and invalidate the list so the stale row disappears.
      if (isEdit && err instanceof ApiError && err.statusCode === 404) {
        notify.error(mapApiError(err));
        opts.onClose();
        qc.invalidateQueries({ queryKey: queryKeys.tickets.all });
        return;
      }

      // Generic server / network error → form-level banner + toast (ADR-1)
      const msg = mapApiError(err);
      form.setError("root", { message: msg });
      notify.error(msg);
    }
  }

  return {
    form,
    onSubmit: form.handleSubmit(onSubmit),
    isSubmitting: form.formState.isSubmitting,
  };
}
