"use client";

/**
 * ClaveCreadaDialog — PRESENTATIONAL: muestra la clave en claro UNA sola vez
 * (api-publica, T9 / CA9), con botón para copiarla. CONTROLADO por el caller:
 * abierto mientras `clave` no es `null`; cerrarlo llama a `onCerrar`, que tira
 * la clave del estado. No se cierra con un click afuera, para no perderla por
 * accidente; sí con Escape, la cruz o "Ya la guardé".
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface ClaveCreadaDialogProps {
  clave: string | null;
  onCerrar: () => void;
}

export function ClaveCreadaDialog({ clave, onCerrar }: ClaveCreadaDialogProps) {
  const [copiada, setCopiada] = useState(false);

  async function copiar() {
    if (!clave) return;
    try {
      await navigator.clipboard.writeText(clave);
      setCopiada(true);
    } catch {
      setCopiada(false);
    }
  }

  function cerrar() {
    setCopiada(false);
    onCerrar();
  }

  return (
    <Dialog open={clave !== null} onOpenChange={(next) => !next && cerrar()}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Clave creada</DialogTitle>
          <DialogDescription>
            Copiala y guardala en un lugar seguro ahora: es la única vez que la vas a ver. Si la perdés, revocala y
            creá otra.
          </DialogDescription>
        </DialogHeader>
        <code
          aria-label="Clave de API"
          className="block break-all rounded border bg-muted px-3 py-2 font-mono text-sm text-foreground"
        >
          {clave}
        </code>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={copiar}>
            {copiada ? "Copiada" : "Copiar clave"}
          </Button>
          <Button type="button" onClick={cerrar}>
            Ya la guardé
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
