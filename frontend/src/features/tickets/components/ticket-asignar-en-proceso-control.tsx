"use client";

/**
 * TicketAsignarEnProcesoControl — PRESENTATIONAL, gated por `ticket:asignar`
 * Y `ticket:transicionar` (ambos, como el endpoint PATCH
 * /tickets/:id/asignar-en-proceso, que exige los dos permisos).
 *
 * Control UNIFICADO del arranque del ticket: un combo con SOLO los técnicos
 * elegibles (ya filtrados por el backend según el módulo del tipo) + un único
 * botón "Asignar y poner en proceso" que asigna al técnico elegido Y avanza el
 * ticket hasta EN_PROCESO en una sola acción.
 *
 * Reemplaza el par separado "asignar" + "transicionar a ASIGNADO/EN_PROCESO":
 * el detalle solo lo monta cuando el ticket está en un estado desde el que se
 * puede llegar a EN_PROCESO (NUEVO/ASIGNADO — ver `puedeAsignarYPonerEnProceso`).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useCan } from "@/shared/hooks/use-can";
import type { TecnicoAsignable } from "../types";

export interface TicketAsignarEnProcesoControlProps {
  tecnicos: TecnicoAsignable[];
  onAsignar: (asignadoId: string) => void;
  isSubmitting: boolean;
}

export function TicketAsignarEnProcesoControl({
  tecnicos,
  onAsignar,
  isSubmitting,
}: TicketAsignarEnProcesoControlProps) {
  const puedeAsignar = useCan("ticket:asignar");
  const puedeTransicionar = useCan("ticket:transicionar");
  const [seleccionado, setSeleccionado] = useState("");

  if (!puedeAsignar || !puedeTransicionar) return null;

  return (
    <div className="flex items-center gap-2">
      <Select
        aria-label="Asignar técnico"
        value={seleccionado}
        onChange={(e) => setSeleccionado(e.target.value)}
        disabled={isSubmitting}
      >
        <option value="">Elegí un técnico</option>
        {tecnicos.map((tecnico) => (
          <option key={tecnico.id} value={tecnico.id}>
            {tecnico.nombre} {tecnico.apellido}
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
        Asignar y poner en proceso
      </Button>
    </div>
  );
}
