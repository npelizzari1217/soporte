"use client";

/**
 * TicketFormModal — PRESENTATIONAL component for creating or editing a ticket.
 *
 * Delegates form logic to useTicketForm (container hook).
 * Uses <FormModal> (Radix Dialog shell) + <FormField> + Input/Textarea/Controller+Select.
 *
 * Mode differences:
 *   create: shows tipoId Select (required); submit label "Crear"
 *   edit:   omits tipoId (immutable after creation); defaultValues pre-filled from `ticket`;
 *           submit label "Guardar"
 *
 * ADR-1: Server errors surface as `errors.root` banner at the top of the form.
 * ADR-6: solicitanteId is injected by the hook, NOT rendered as a field.
 * Design §2: <Select> requires <Controller> because it is a controlled atom without a ref.
 * Design §4: tipoId and estadoId are locked after creation — NOT rendered in edit mode.
 *
 * Spec: tickets-ui §req Formulario de creación; §req Formulario de edición
 * Design: design.md §4 (Create/Edit flows), §2 (Controller for Select)
 */

import { Controller } from "react-hook-form";
import { FormModal } from "@/components/ui/form-modal";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { TIPOS, PRIORIDADES } from "@/shared/lib/catalogos";
import { useTicketForm } from "../hooks/use-ticket-form";
import type { Ticket } from "../types";

// ─── Option helpers ───────────────────────────────────────────────────────────

function toOptions(map: Record<string, string>) {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}

const TIPO_OPTIONS = toOptions(TIPOS);
const PRIORIDAD_OPTIONS = toOptions(PRIORIDADES);

// ─── Props ────────────────────────────────────────────────────────────────────

interface TicketFormModalProps {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Required for edit mode — provides defaultValues and the ticket id for PATCH. */
  ticket?: Ticket;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TicketFormModal({ mode, open, onOpenChange, ticket }: TicketFormModalProps) {
  function handleClose() {
    onOpenChange(false);
  }

  const { form, onSubmit, isSubmitting } = useTicketForm(mode, {
    onClose: handleClose,
    ticket,
  });

  const {
    register,
    control,
    formState: { errors },
  } = form;

  const isEdit = mode === "edit";

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Editar ticket" : "Nuevo ticket"}
      description={
        isEdit
          ? "Modificá los datos del ticket."
          : "Completá los datos para crear un ticket."
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {/* Root-level server error banner (ADR-1) */}
        {errors.root?.message && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {errors.root.message}
          </p>
        )}

        {/* titulo */}
        <FormField
          label="Título"
          htmlFor="titulo"
          error={errors.titulo?.message}
          required
        >
          <Input
            id="titulo"
            aria-label="Título"
            {...register("titulo")}
            error={!!errors.titulo}
            placeholder="Descripción breve del problema"
          />
        </FormField>

        {/* descripcion */}
        <FormField
          label="Descripción"
          htmlFor="descripcion"
          error={errors.descripcion?.message}
        >
          <Textarea
            id="descripcion"
            aria-label="Descripción"
            {...register("descripcion")}
            error={!!errors.descripcion}
            placeholder="Detalles adicionales (opcional)"
            rows={3}
          />
        </FormField>

        {/* tipoId — CREATE ONLY (type is immutable after creation, per backend contract) */}
        {!isEdit && (
          <FormField
            label="Tipo"
            htmlFor="tipoId"
            error={errors.tipoId?.message}
            required
          >
            <Controller
              control={control}
              name="tipoId"
              render={({ field }) => (
                <Select
                  aria-label="Tipo"
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  options={TIPO_OPTIONS}
                  placeholder="Seleccionar tipo"
                  error={!!errors.tipoId}
                />
              )}
            />
          </FormField>
        )}

        {/* prioridadId — requires Controller (Select is controlled, no ref) */}
        <FormField
          label="Prioridad"
          htmlFor="prioridadId"
          error={errors.prioridadId?.message}
          required={!isEdit}
        >
          <Controller
            control={control}
            name="prioridadId"
            render={({ field }) => (
              <Select
                aria-label="Prioridad"
                value={field.value ?? ""}
                onValueChange={field.onChange}
                options={PRIORIDAD_OPTIONS}
                placeholder="Seleccionar prioridad"
                error={!!errors.prioridadId}
              />
            )}
          />
        </FormField>

        {/* fechaVencimiento (optional) */}
        <FormField
          label="Fecha de vencimiento"
          htmlFor="fechaVencimiento"
          error={errors.fechaVencimiento?.message}
        >
          <Input
            id="fechaVencimiento"
            type="date"
            aria-label="Fecha de vencimiento"
            {...register("fechaVencimiento")}
            error={!!errors.fechaVencimiento}
          />
        </FormField>

        {/* Footer lives inside the form so type="submit" works correctly */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {isEdit ? "Guardar" : "Crear"}
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
