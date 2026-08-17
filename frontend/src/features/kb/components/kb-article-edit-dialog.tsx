"use client";

/**
 * KbArticleEditDialog — modal para editar un artículo de KB (R-M3 / T3.4),
 * abierto desde el botón "Editar" de `KbDetailView` (conversión a modal,
 * feat/ui-premium-educandow — antes ruta dedicada `/kb/:id/editar`, revisión
 * de ADR-1). Gate `KB:MODIFICACION` lo aplica el caller. NO edita visibilidad
 * (endpoint dedicado, `KbVisibilityToggle` en el detalle, T3.5). Recibe el
 * artículo ya cargado por `KbDetailView` — evita un segundo `GET /kb/:id`.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useEditarKbArticulo } from "../hooks/use-kb-mutations";
import { KbArticuloForm } from "./kb-article-form";
import type { CrearKbArticuloDto, KbArticulo } from "../types";

export interface KbArticleEditDialogProps {
  articulo: KbArticulo;
}

export function KbArticleEditDialog({ articulo }: KbArticleEditDialogProps) {
  const [open, setOpen] = useState(false);
  const editarMutation = useEditarKbArticulo(articulo.id);

  function handleSubmit(dto: CrearKbArticuloDto) {
    editarMutation.mutate(dto, {
      onSuccess: () => setOpen(false),
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar artículo</DialogTitle>
        </DialogHeader>
        <KbArticuloForm
          defaultValues={{
            titulo: articulo.titulo,
            contenido: articulo.contenido,
            tipoTicketId: articulo.tipoTicketId ?? "",
          }}
          onSubmit={handleSubmit}
          onCancel={() => setOpen(false)}
          isSubmitting={editarMutation.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
