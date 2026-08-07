"use client";

/**
 * TicketTransitionControl — PRESENTATIONAL, gated por `ticket:transicionar`
 * (TECNICO+). Solo ofrece los destinos válidos desde el estado actual
 * (`getValidNextStates` — T1.10, sin reapertura). El backend revalida el
 * mismo grafo (ADR-3) — esto es UX, no la única barrera.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useCan } from "@/shared/hooks/use-can";
import { getValidNextStates } from "../lib/estado-transitions";
import type { TicketEstadoCodigo } from "../types";

const ESTADO_LABEL: Record<TicketEstadoCodigo, string> = {
  NUEVO: "Nuevo",
  ASIGNADO: "Asignado",
  EN_PROCESO: "En proceso",
  RESUELTO: "Resuelto",
  CERRADO: "Cerrado",
  CANCELADO: "Cancelado",
};

export interface TicketTransitionControlProps {
  estadoActualCodigo: string;
  onTransicionar: (nuevoEstadoCodigo: string) => void;
  isSubmitting: boolean;
}

export function TicketTransitionControl({
  estadoActualCodigo,
  onTransicionar,
  isSubmitting,
}: TicketTransitionControlProps) {
  const puedeTransicionar = useCan("ticket:transicionar");
  const opciones = getValidNextStates(estadoActualCodigo);
  const [destino, setDestino] = useState<string>(opciones[0] ?? "");

  if (!puedeTransicionar) return null;

  if (opciones.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin transiciones disponibles (estado final).</p>;
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        aria-label="Nuevo estado"
        value={destino}
        onChange={(e) => setDestino(e.target.value)}
        disabled={isSubmitting}
      >
        {opciones.map((codigo) => (
          <option key={codigo} value={codigo}>
            {ESTADO_LABEL[codigo]}
          </option>
        ))}
      </Select>
      <Button
        type="button"
        size="sm"
        isLoading={isSubmitting}
        onClick={() => destino && onTransicionar(destino)}
      >
        Confirmar
      </Button>
    </div>
  );
}
