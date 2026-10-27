"use client";

/**
 * ClaveCreadaDialog — PRESENTATIONAL: muestra la clave en claro UNA sola vez
 * (api-publica, T9 / CA9), con botón para copiarla. CONTROLADO por el caller:
 * abierto mientras `clave` no es `null`; cerrarlo llama a `onCerrar`, que tira
 * la clave del estado. No se cierra con un click afuera, para no perderla por
 * accidente; sí con Escape, la cruz o "Ya la guardé".
 *
 * `textos` adapta el copy para otro secreto de un solo uso (el de firma del
 * webhook, webhooks T7); sin él, es el diálogo de la clave de API.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface TextosSecretoUnico {
  titulo: string;
  descripcion: string;
  etiqueta: string;
  copiar: string;
  copiado: string;
  cerrar: string;
}

const TEXTOS_CLAVE_API: TextosSecretoUnico = {
  titulo: "Clave creada",
  descripcion:
    "Cópiela y guárdela en un lugar seguro ahora: es la única vez que podrá verla. Si la pierde, revóquela y cree otra.",
  etiqueta: "Clave de API",
  copiar: "Copiar clave",
  copiado: "Copiada",
  cerrar: "Ya la guardé",
};

export interface ClaveCreadaDialogProps {
  clave: string | null;
  onCerrar: () => void;
  textos?: TextosSecretoUnico;
}

export function ClaveCreadaDialog({ clave, onCerrar, textos = TEXTOS_CLAVE_API }: ClaveCreadaDialogProps) {
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
          <DialogTitle>{textos.titulo}</DialogTitle>
          <DialogDescription>{textos.descripcion}</DialogDescription>
        </DialogHeader>
        <code
          aria-label={textos.etiqueta}
          className="block break-all rounded border bg-muted px-3 py-2 font-mono text-sm text-foreground"
        >
          {clave}
        </code>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={copiar}>
            {copiada ? textos.copiado : textos.copiar}
          </Button>
          <Button type="button" onClick={cerrar}>
            {textos.cerrar}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
