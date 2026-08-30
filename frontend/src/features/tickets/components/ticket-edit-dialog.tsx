"use client";

/**
 * TicketEditDialog — modal que envuelve `TicketEditForm` (conversión a
 * modal, feat/ui-premium-educandow). Antes el form se mostraba inline en
 * `TicketDetailView` al togglear "Editar"; ahora abre en un modal y se
 * cierra al guardar o cancelar. Gate `ticket:editar` + bloqueo por estado
 * (`edicionPermitida`) los sigue resolviendo el caller.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TicketEditForm } from "./ticket-edit-form";
import type { EditarTicketFormValues } from "../schemas";
import type { Prioridad } from "../types";

export interface TicketEditDialogProps {
  defaultValues: EditarTicketFormValues;
  /** Pass-through directo hacia `TicketEditForm` — ver el JSDoc de esa prop: `undefined` = catálogo sin resolver. */
  prioridades: Prioridad[] | undefined;
  onSubmit: (values: EditarTicketFormValues) => void;
  isSubmitting: boolean;
}

export function TicketEditDialog({ defaultValues, prioridades, onSubmit, isSubmitting }: TicketEditDialogProps) {
  const [open, setOpen] = useState(false);

  function handleSubmit(values: EditarTicketFormValues) {
    // Mismo comportamiento que el form inline previo: dispara la mutación y
    // cierra de inmediato (no espera onSuccess) — la vista se actualiza sola
    // cuando la mutación invalida el detalle.
    onSubmit(values);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar ticket</DialogTitle>
        </DialogHeader>
        <TicketEditForm
          defaultValues={defaultValues}
          prioridades={prioridades}
          onSubmit={handleSubmit}
          onCancel={() => setOpen(false)}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  );
}
