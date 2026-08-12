"use client";

/**
 * AdoptarCicloDialog — modal que envuelve `AdoptarCicloForm` (T4.5,
 * conversión a modal feat/ui-premium-educandow). Antes el form vivía inline
 * arriba de la lista de ciclos adoptados; ahora abre en un modal chico y se
 * cierra solo tras un alta exitosa. Gate `ciclo:gestionar` lo aplica el
 * caller (`CiclosAdminView`, vía `<Can>` ancestro).
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AdoptarCicloForm } from "./adoptar-ciclo-form";

export function AdoptarCicloDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Adoptar ciclo</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adoptar ciclo</DialogTitle>
        </DialogHeader>
        <AdoptarCicloForm onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
