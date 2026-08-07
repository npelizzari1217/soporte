"use client";

/**
 * ClienteSelection — PRESENTATIONAL component for the multi-membership login step.
 *
 * Shown when POST /api/auth/login returns `{ needsClienteSelection: true, membresias }`
 * (R4/R5): the user belongs to more than one cliente, so they must pick which one
 * to log into before the (2nd) login POST re-sends `{ email, password, clienteId }`.
 *
 * Spec: [R23] BFF login route — needsClienteSelection.
 */

import { Button } from "@/components/ui/button";

export interface Membresia {
  cliente_id: string;
  nombre: string;
  rol: string;
}

interface ClienteSelectionProps {
  membresias: Membresia[];
  onSelect: (clienteId: string) => void;
  isLoading: boolean;
}

export function ClienteSelection({ membresias, onSelect, isLoading }: ClienteSelectionProps) {
  return (
    <ul className="flex flex-col gap-2">
      {membresias.map((m) => (
        <li key={m.cliente_id}>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between"
            disabled={isLoading}
            onClick={() => onSelect(m.cliente_id)}
          >
            <span>{m.nombre}</span>
            <span className="text-xs text-muted-foreground">{m.rol}</span>
          </Button>
        </li>
      ))}
    </ul>
  );
}
