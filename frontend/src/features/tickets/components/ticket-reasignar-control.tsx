"use client";

/**
 * TicketReasignarControl — PRESENTATIONAL, gated por `TICKETS:ASIGNAR`.
 *
 * Reasignación simple: cambia el responsable SIN tocar el estado (a diferencia
 * de "Asignar y poner en proceso"). El detalle lo monta mientras el ticket no
 * sea terminal (ver `puedeReasignar`); en NUEVO/ASIGNADO convive con el control
 * de arranque. El copy dice "responsable" (el universo incluye colaboradores).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useCan } from "@/shared/hooks/use-can";
import type { TecnicoAsignable } from "../types";

export interface TicketReasignarControlProps {
  tecnicos: TecnicoAsignable[];
  onReasignar: (asignadoId: string) => void;
  isSubmitting: boolean;
}

export function TicketReasignarControl({ tecnicos, onReasignar, isSubmitting }: TicketReasignarControlProps) {
  const puedeAsignar = useCan("TICKETS:ASIGNAR");
  const [seleccionado, setSeleccionado] = useState("");

  if (!puedeAsignar) return null;

  return (
    <div className="flex items-center gap-2">
      <Select
        aria-label="Cambiar responsable"
        value={seleccionado}
        onChange={(e) => setSeleccionado(e.target.value)}
        disabled={isSubmitting}
      >
        <option value="">Elegí otro responsable</option>
        {tecnicos.map((tecnico) => (
          <option key={tecnico.id} value={tecnico.id}>
            {tecnico.nombre} {tecnico.apellido}
          </option>
        ))}
      </Select>
      <Button
        type="button"
        size="sm"
        variant="outline"
        isLoading={isSubmitting}
        disabled={!seleccionado}
        onClick={() => seleccionado && onReasignar(seleccionado)}
      >
        Reasignar
      </Button>
    </div>
  );
}
