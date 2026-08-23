"use client";

/**
 * ConfigurarCsatDialog — prende/apaga la encuesta de satisfacción (CSAT) de
 * UN cliente (sdd/csat, WU10.2). Diálogo SEPARADO de `EditarClienteDialog`
 * a propósito, mismo criterio que `ConfigurarCorreoDialog` (D7): el backend
 * separa `/csat` en una ruta propia, así que la edición comercial y este
 * flag nunca comparten body.
 *
 * A diferencia de correo, `csatHabilitado` NO es un secreto: viaja directo
 * en `Cliente` (`GET /clientes`), así que este diálogo arranca prellenado
 * sin necesitar un fetch de detalle aparte. Exclusivo ROOT (el caller ya
 * gatea por `isGlobalAdmin`, ver `ClientesAdminView`).
 */
import { useEffect, useState } from "react";
import { Smile } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfigurarCsatCliente } from "../hooks/use-clientes-mutations";
import type { Cliente } from "../types";

export interface ConfigurarCsatDialogProps {
  cliente: Cliente;
}

export function ConfigurarCsatDialog({ cliente }: ConfigurarCsatDialogProps) {
  const [open, setOpen] = useState(false);
  const [habilitado, setHabilitado] = useState(cliente.csatHabilitado);
  const configurarMutation = useConfigurarCsatCliente(cliente.id);

  // Reabrir el diálogo siempre refleja el valor real del cliente, no un
  // estado local viejo de una apertura anterior sin guardar.
  useEffect(() => {
    if (open) setHabilitado(cliente.csatHabilitado);
  }, [open, cliente.csatHabilitado]);

  function submit() {
    configurarMutation.mutate(
      { habilitado },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Encuesta de satisfacción de ${cliente.nombre}`}>
          <Smile className="h-4 w-4" aria-hidden="true" />
          Encuesta
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Encuesta de satisfacción — {cliente.nombre}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox checked={habilitado} onCheckedChange={(checked) => setHabilitado(checked === true)} />
            Encuesta de satisfacción habilitada
          </label>
          <p className="text-xs text-muted-foreground">
            Con la encuesta habilitada, cada ticket cerrado le envía al usuario un correo con un
            link para calificar la atención recibida.
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="button" isLoading={configurarMutation.isPending} onClick={submit}>
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
