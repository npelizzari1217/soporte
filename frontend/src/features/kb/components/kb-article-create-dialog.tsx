"use client";

/**
 * KbArticleCreateDialog — modal para crear un artículo de KB (R-M3 / T3.4),
 * abierto desde el botón "Nuevo artículo" de `/kb` (conversión a modal,
 * feat/ui-premium-educandow — antes ruta dedicada `/kb/nuevo`, revisión de
 * ADR-1). Gate `KB:ALTAS` lo aplica el caller (`KbListView`, vía
 * `<Can>`). El artículo nace interno (`visibleParaSolicitante=false`) — se
 * publica desde el detalle (T3.5).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCrearKbArticulo } from "../hooks/use-kb-mutations";
import { KbArticuloForm } from "./kb-article-form";
import type { CrearKbArticuloDto } from "../types";

export function KbArticleCreateDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const crearMutation = useCrearKbArticulo();

  function handleSubmit(dto: CrearKbArticuloDto) {
    crearMutation.mutate(dto, {
      onSuccess: (articulo) => {
        setOpen(false);
        router.push(`/kb/${articulo.id}`);
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nuevo artículo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo artículo</DialogTitle>
        </DialogHeader>
        <KbArticuloForm onSubmit={handleSubmit} isSubmitting={crearMutation.isPending} submitLabel="Crear" />
      </DialogContent>
    </Dialog>
  );
}
