"use client";

/**
 * TicketTransitionControl — PRESENTATIONAL, gated por `puedeTransicionar`:
 * `TRANSICIONAR` sobre el tipo del ticket, que decide el contenedor
 * (odd/permisos-por-tipo-ticket, S6). Ofrece los destinos MANUALES desde el estado actual
 * (`getManualNextStates`): el grafo válido MENOS los arcos de arranque
 * (NUEVO→ASIGNADO, ASIGNADO→EN_PROCESO) que ahora cubre el control unificado
 * "Asignar y poner en proceso" — así no quedan dos caminos al mismo destino.
 *
 * Salto correctivo: ROOT (`is_global_admin`) y ADMINISTRADOR del cliente ven
 * ADEMÁS una sección "Corregir estado" que ofrece cualquier estado NO terminal
 * (volver atrás/corregir/reabrir), salteando el grafo. El backend revalida el
 * grafo + el salto correctivo (ADR-3) — esto es UX, no la barrera.
 *
 * Cada desplegable lleva su etiqueta visible y una línea de ayuda
 * (odd/tasks/acciones-ticket-agrupadas, S2): antes solo tenían `aria-label`, y en
 * pantalla no se distinguía qué botón actuaba sobre qué lista.
 */
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { etiquetaOpcionEstado } from "@/components/ui/status-badge";
import { useSession } from "@/shared/hooks/use-session";
import { getEstadosCorrectivos, getManualNextStates } from "../lib/estado-transitions";

export interface TicketTransitionControlProps {
  estadoActualCodigo: string;
  onTransicionar: (nuevoEstadoCodigo: string) => void;
  isSubmitting: boolean;
  /** `TRANSICIONAR` sobre el tipo del ticket. */
  puedeTransicionar: boolean;
}

export function TicketTransitionControl({
  estadoActualCodigo,
  onTransicionar,
  isSubmitting,
  puedeTransicionar,
}: TicketTransitionControlProps) {
  const { user, isGlobalAdmin } = useSession();
  const esCorrector = isGlobalAdmin || user?.rol === "ADMINISTRADOR";

  const opciones = getManualNextStates(estadoActualCodigo);
  const correctivos = esCorrector ? getEstadosCorrectivos(estadoActualCodigo) : [];

  const [destino, setDestino] = useState<string>(opciones[0] ?? "");
  const [destinoCorrectivo, setDestinoCorrectivo] = useState<string>(correctivos[0] ?? "");
  const destinoId = useId();
  const correctivoId = useId();

  if (!puedeTransicionar) return null;

  // Sin arcos manuales NI salto correctivo disponible → estado final real.
  if (opciones.length === 0 && correctivos.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin transiciones disponibles (estado final).</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {opciones.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={destinoId}>Nuevo estado</Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              id={destinoId}
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              disabled={isSubmitting}
            >
              {opciones.map((codigo) => (
                <option key={codigo} value={codigo}>
                  {etiquetaOpcionEstado(codigo)}
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
          <p className="text-xs text-muted-foreground">Avanza el ticket al estado elegido.</p>
        </div>
      )}

      {correctivos.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-border p-3">
          <Label htmlFor={correctivoId}>Corregir estado</Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              id={correctivoId}
              value={destinoCorrectivo}
              onChange={(e) => setDestinoCorrectivo(e.target.value)}
              disabled={isSubmitting}
            >
              {correctivos.map((codigo) => (
                <option key={codigo} value={codigo}>
                  {etiquetaOpcionEstado(codigo)}
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
          <p className="text-xs text-muted-foreground">
            Salta el flujo normal para volver atrás o reabrir. Solo ROOT y administradores.
          </p>
        </div>
      )}
    </div>
  );
}
