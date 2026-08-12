"use client";

/**
 * CrearTipoComponenteDialog — modal que envuelve `CrearTipoComponenteForm`
 * (PR5, sdd/tipos-componente-master, conversión a modal
 * feat/ui-premium-educandow). Antes el form vivía inline arriba de la lista
 * del catálogo; ahora abre en un modal chico y se cierra solo tras un alta
 * exitosa. Gate `isGlobalAdmin` lo aplica el caller
 * (`TiposComponenteAdminView`).
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CrearTipoComponenteForm } from "./crear-tipo-componente-form";

export function CrearTipoComponenteDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Nuevo tipo</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo tipo de componente</DialogTitle>
        </DialogHeader>
        <CrearTipoComponenteForm onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
