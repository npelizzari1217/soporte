"use client";

/**
 * TicketTransitionControl — PRESENTATIONAL, gated por `TICKETS:TRANSICIONAR`
 * (TECNICO+). Ofrece los destinos MANUALES desde el estado actual
 * (`getManualNextStates`): el grafo válido MENOS los arcos de arranque
 * (NUEVO→ASIGNADO, ASIGNADO→EN_PROCESO) que ahora cubre el control unificado
 * "Asignar y poner en proceso" — así no quedan dos caminos al mismo destino.
 *
 * Salto correctivo: ROOT (`is_global_admin`) y ADMINISTRADOR del cliente ven
 * ADEMÁS una sección "Corregir estado" que ofrece cualquier estado NO terminal
 * (volver atrás/corregir/reabrir), salteando el grafo. El backend revalida el
 * grafo + el salto correctivo (ADR-3) — esto es UX, no la barrera.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useCan } from "@/shared/hooks/use-can";
import { useSession } from "@/shared/hooks/use-session";
import { getEstadosCorrectivos, getManualNextStates } from "../lib/estado-transitions";
import type { TicketEstadoCodigo } from "../types";

const ESTADO_LABEL: Record<TicketEstadoCodigo, string> = {
  NUEVO: "Nuevo",
  ASIGNADO: "Asignado",
  EN_PROCESO: "En proceso",
  ESPERANDO_CLIENTE: "Esperando al cliente",
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
  const puedeTransicionar = useCan("TICKETS:TRANSICIONAR");
  const { user, isGlobalAdmin } = useSession();
  const esCorrector = isGlobalAdmin || user?.rol === "ADMINISTRADOR";

  const opciones = getManualNextStates(estadoActualCodigo);
  const correctivos = esCorrector ? getEstadosCorrectivos(estadoActualCodigo) : [];

  const [destino, setDestino] = useState<string>(opciones[0] ?? "");
  const [destinoCorrectivo, setDestinoCorrectivo] = useState<string>(correctivos[0] ?? "");

  if (!puedeTransicionar) return null;

  // Sin arcos manuales NI salto correctivo disponible → estado final real.
  if (opciones.length === 0 && correctivos.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin transiciones disponibles (estado final).</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {opciones.length > 0 && (
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
      )}

      {correctivos.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            Corregir estado (ROOT/Administrador)
          </span>
          <div className="flex items-center gap-2">
            <Select
              aria-label="Corregir estado"
              value={destinoCorrectivo}
              onChange={(e) => setDestinoCorrectivo(e.target.value)}
              disabled={isSubmitting}
            >
              {correctivos.map((codigo) => (
                <option key={codigo} value={codigo}>
                  {ESTADO_LABEL[codigo]}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              isLoading={isSubmitting}
              onClick={() => destinoCorrectivo && onTransicionar(destinoCorrectivo)}
            >
              Corregir
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
