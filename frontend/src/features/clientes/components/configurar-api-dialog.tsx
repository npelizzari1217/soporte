"use client";

/**
 * ConfigurarApiDialog — prende/apaga la API pública de UN cliente
 * (api-publica, T8 / CA4). Diálogo SEPARADO de `EditarClienteDialog`, mismo
 * criterio que `ConfigurarCsatDialog`: el backend separa `/api` en una ruta
 * propia.
 *
 * `apiHabilitada` viaja en `Cliente` (`GET /clientes`), así que el diálogo
 * muestra el estado real sin un fetch aparte. El cambio va detrás de
 * `ConfirmDialog` porque apagar la API corta en el acto a todo sistema
 * externo que use las claves del cliente. Exclusivo ROOT (el caller ya gatea
 * por `isGlobalAdmin`, ver `ClientesAdminView`).
 */
import { useState } from "react";
import { Plug } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfigurarApiCliente } from "../hooks/use-clientes-mutations";
import type { Cliente } from "../types";

export interface ConfigurarApiDialogProps {
  cliente: Cliente;
}

export function ConfigurarApiDialog({ cliente }: ConfigurarApiDialogProps) {
  const [open, setOpen] = useState(false);
  const configurarMutation = useConfigurarApiCliente(cliente.id);
  const habilitada = cliente.apiHabilitada;

  function confirmar() {
    configurarMutation.mutate({ habilitada: !habilitada }, { onSuccess: () => setOpen(false) });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`API pública de ${cliente.nombre}`}>
          <Plug className="h-4 w-4" aria-hidden="true" />
          API
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>API pública — {cliente.nombre}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <p className="text-sm text-foreground">
            Estado: <strong>{habilitada ? "Habilitada" : "Deshabilitada"}</strong>
          </p>
          <p className="text-xs text-muted-foreground">
            {habilitada
              ? "Los sistemas externos del cliente operan con las claves que creó su ADMINISTRADOR desde la pantalla \"Integraciones\"."
              : "Con la API habilitada, el ADMINISTRADOR del cliente crea las claves desde la pantalla \"Integraciones\", y los sistemas externos las usan para operar."}
          </p>
        </div>

        <div className="flex justify-end pt-2">
          {habilitada ? (
            <ConfirmDialog
              trigger={
                <Button type="button" variant="destructive">
                  Deshabilitar API
                </Button>
              }
              title="Deshabilitar API pública"
              description={`¿Confirma deshabilitar la API de "${cliente.nombre}"? Todas las claves de este cliente dejan de funcionar en el acto. Las claves y el usuario de integración se conservan: si la volvés a habilitar, las claves no revocadas vuelven a funcionar.`}
              confirmLabel="Deshabilitar"
              confirmVariant="destructive"
              isConfirming={configurarMutation.isPending}
              onConfirm={confirmar}
            />
          ) : (
            <ConfirmDialog
              trigger={<Button type="button">Habilitar API</Button>}
              title="Habilitar API pública"
              description={`¿Confirma habilitar la API de "${cliente.nombre}"? Después, el ADMINISTRADOR del cliente crea las claves desde la pantalla "Integraciones".`}
              confirmLabel="Habilitar"
              isConfirming={configurarMutation.isPending}
              onConfirm={confirmar}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
