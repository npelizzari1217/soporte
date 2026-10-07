"use client";

/**
 * CodigosRecuperacion — PRESENTATIONAL component: muestra los códigos de recuperación UNA sola vez.
 *
 * "Continuar" queda deshabilitado hasta marcar "Los guardé": recién ahí el container llama a
 * `login/continuar` con el ticket. Ofrece copiar todos los códigos al portapapeles.
 *
 * Spec: sdd/verificacion-dos-pasos — T5, L5.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface CodigosRecuperacionProps {
  codigos: string[];
  onContinuar: () => void;
  isLoading: boolean;
}

export function CodigosRecuperacion({ codigos, onContinuar, isLoading }: CodigosRecuperacionProps) {
  const [guardados, setGuardados] = useState(false);
  const [copiados, setCopiados] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigos.join("\n"));
      setCopiados(true);
    } catch {
      setCopiados(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Guardá estos códigos en un lugar seguro. Cada uno sirve una sola vez si perdés tu app autenticadora, y no
        los vas a poder ver de nuevo.
      </p>
      <ul aria-label="Códigos de recuperación" className="grid grid-cols-2 gap-2 font-mono text-sm">
        {codigos.map((c) => (
          <li key={c} className="rounded border bg-muted px-2 py-1 text-center">
            {c}
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" onClick={copiar}>
        {copiados ? "Copiados" : "Copiar códigos"}
      </Button>
      <label htmlFor="codigos-guardados" className="flex items-center gap-2 text-sm text-foreground">
        <input
          id="codigos-guardados"
          type="checkbox"
          checked={guardados}
          onChange={(e) => setGuardados(e.target.checked)}
        />
        Los guardé
      </label>
      <Button type="button" disabled={!guardados} isLoading={isLoading} onClick={onContinuar} className="w-full">
        Continuar
      </Button>
    </div>
  );
}
