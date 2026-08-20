"use client";

/**
 * TicketAsignarEnProcesoControl — PRESENTATIONAL, gated por `TICKETS:ASIGNAR`
 * Y `TICKETS:TRANSICIONAR` (ambos, como el endpoint PATCH
 * /tickets/:id/asignar-en-proceso, que exige los dos permisos).
 *
 * Control UNIFICADO del arranque del ticket: un combo con los responsables
 * elegibles (ya filtrados por el backend según el módulo del tipo) + un único
 * botón "Asignar y poner en proceso" que asigna al elegido Y avanza el ticket
 * hasta EN_PROCESO en una sola acción.
 *
 * El copy dice "responsable" y no "técnico" a propósito: el universo elegible
 * incluye TECNICO y COLABORADOR (los colaboradores también cumplen funciones
 * de técnico). Decir "técnico" mentiría en cuanto aparezca un colaborador.
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
  const puedeAsignar = useCan("TICKETS:ASIGNAR");
  const puedeTransicionar = useCan("TICKETS:TRANSICIONAR");
  const [seleccionado, setSeleccionado] = useState("");

  if (!puedeAsignar || !puedeTransicionar) return null;

  return (
    <div className="flex items-center gap-2">
      <Select
        aria-label="Asignar responsable"
        value={seleccionado}
        onChange={(e) => setSeleccionado(e.target.value)}
        disabled={isSubmitting}
      >
        <option value="">Elegí un responsable</option>
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
