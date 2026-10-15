"use client";

/**
 * TicketEditDialog — modal que envuelve `TicketEditForm` (conversión a
 * modal, feat/ui-premium-educandow). Antes el form se mostraba inline en
 * `TicketDetailView` al togglear "Editar"; ahora abre en un modal y se
 * cierra al guardar o cancelar. Gate `ticket:editar` + bloqueo por estado
 * (`edicionPermitida`) los sigue resolviendo el caller.
 *
 * El catálogo de sectores lo pide este diálogo, y recién al abrirse: el detalle
 * del ticket no lo necesita para nada más (odd/ubicacion-sector-ticket).
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSectores } from "@/features/sectores/hooks/use-sectores";
import { TicketEditForm } from "./ticket-edit-form";
import type { EditarTicketFormValues } from "../schemas";
import type { EditarTicketDto, Prioridad } from "../types";

export interface TicketEditDialogProps {
  defaultValues: EditarTicketFormValues;
  /** Pass-through directo hacia `TicketEditForm` — ver el JSDoc de esa prop: `undefined` = catálogo sin resolver. */
  prioridades: Prioridad[] | undefined;
  /** Pass-through hacia `TicketEditForm`: nombre del sector vigente, aunque esté desactivado. */
  sectorNombre: string | null;
  /** Pass-through hacia `TicketEditForm`: `false` en los tickets de Edilicia (CA2). */
  mostrarUbicacion: boolean;
  onSubmit: (dto: EditarTicketDto) => void;
  isSubmitting: boolean;
}

export function TicketEditDialog({
  defaultValues,
  prioridades,
  sectorNombre,
  mostrarUbicacion,
  onSubmit,
  isSubmitting,
}: TicketEditDialogProps) {
  const [open, setOpen] = useState(false);
  const sectoresQuery = useSectores(open);

  function handleSubmit(values: EditarTicketDto) {
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
          // `data` tal cual: `undefined` mientras no resolvió (ver JSDoc de la prop).
          sectores={sectoresQuery.data}
          sectorNombre={sectorNombre}
          mostrarUbicacion={mostrarUbicacion}
          onSubmit={handleSubmit}
          onCancel={() => setOpen(false)}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  );
}
