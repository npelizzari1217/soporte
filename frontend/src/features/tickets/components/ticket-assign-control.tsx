"use client";

/**
 * TicketAssignControl — PRESENTATIONAL, gated por `ticket:asignar`
 * (TECNICO+). Selector de técnicos elegibles (G2, `GET /usuarios`).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useCan } from "@/shared/hooks/use-can";
import type { UsuarioAsignable } from "../types";

export interface TicketAssignControlProps {
  usuarios: UsuarioAsignable[];
  asignadoActualId: string | null;
  onAsignar: (asignadoId: string) => void;
  isSubmitting: boolean;
}

export function TicketAssignControl({
  usuarios,
  asignadoActualId,
  onAsignar,
  isSubmitting,
}: TicketAssignControlProps) {
  const puedeAsignar = useCan("ticket:asignar");
  const [seleccionado, setSeleccionado] = useState(asignadoActualId ?? "");

  if (!puedeAsignar) return null;

  return (
    <div className="flex items-center gap-2">
      <Select
        aria-label="Asignar a"
        value={seleccionado}
        onChange={(e) => setSeleccionado(e.target.value)}
        disabled={isSubmitting}
      >
        <option value="">Sin asignar</option>
        {usuarios.map((usuario) => (
          <option key={usuario.id} value={usuario.id}>
            {usuario.nombre} {usuario.apellido}
          </option>
        ))}
      </Select>
      <Button
        type="button"
        size="sm"
        isLoading={isSubmitting}
        disabled={!seleccionado}
        onClick={() => seleccionado && onAsignar(seleccionado)}
      >
        Asignar
      </Button>
    </div>
  );
}
