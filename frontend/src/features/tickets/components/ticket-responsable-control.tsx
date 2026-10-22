"use client";

/**
 * TicketResponsableControl — PRESENTATIONAL. Un solo desplegable de responsables y un solo botón,
 * cuyo efecto depende del modo que decide el CONTAINER a partir del estado del ticket
 * (odd/tasks/acciones-ticket-agrupadas, S1):
 *
 * - `arranque` (NUEVO/ASIGNADO): "Asignar y poner en proceso" asigna al elegido Y avanza el ticket
 *   hasta EN_PROCESO en una sola acción (`PATCH /tickets/:id/asignar-en-proceso`). Exige
 *   ASIGNAR y TRANSICIONAR sobre el tipo del ticket, como el endpoint. Si falta TRANSICIONAR, cae
 *   al modo `cambio`: lo que ese usuario ya podía hacer.
 * - `cambio` (cualquier otro estado no terminal): "Cambiar responsable" reasigna sin tocar el
 *   estado (`PATCH /tickets/:id/asignar`). Exige ASIGNAR sobre el tipo.
 *
 * Las dos acciones las decide el contenedor sobre el tipo del ticket (odd/permisos-por-tipo-ticket,
 * S6) y llegan como props.
 *
 * Reemplaza a los dos controles anteriores, que en NUEVO/ASIGNADO mostraban la misma lista de
 * responsables dos veces, cada una con su botón. El copy dice "responsable" y no "técnico": el
 * universo elegible incluye colaboradores.
 */
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { TecnicoAsignable } from "../types";

export type ModoResponsable = "arranque" | "cambio";

export interface TicketResponsableControlProps {
  tecnicos: TecnicoAsignable[];
  /** `arranque` en NUEVO/ASIGNADO; `cambio` en los demás estados no terminales. */
  modo: ModoResponsable;
  onAsignarEnProceso: (asignadoId: string) => void;
  onReasignar: (asignadoId: string) => void;
  isSubmitting: boolean;
  /** `ASIGNAR` sobre el tipo del ticket. */
  puedeAsignar: boolean;
  /** `TRANSICIONAR` sobre el tipo del ticket. */
  puedeTransicionar: boolean;
}

export function TicketResponsableControl({
  tecnicos,
  modo,
  onAsignarEnProceso,
  onReasignar,
  isSubmitting,
  puedeAsignar,
  puedeTransicionar,
}: TicketResponsableControlProps) {
  const [seleccionado, setSeleccionado] = useState("");
  const selectId = useId();

  if (!puedeAsignar) return null;

  const arranque = modo === "arranque" && puedeTransicionar;
  const confirmar = arranque ? onAsignarEnProceso : onReasignar;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={selectId}>Nuevo responsable</Label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select
          id={selectId}
          value={seleccionado}
          onChange={(e) => setSeleccionado(e.target.value)}
          disabled={isSubmitting}
        >
          <option value="">{arranque ? "Elegí un responsable" : "Elegí otro responsable"}</option>
          {tecnicos.map((tecnico) => (
            <option key={tecnico.id} value={tecnico.id}>
              {tecnico.nombre} {tecnico.apellido}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          size="sm"
          variant={arranque ? "default" : "outline"}
          isLoading={isSubmitting}
          disabled={!seleccionado}
          onClick={() => seleccionado && confirmar(seleccionado)}
        >
          {arranque ? "Asignar y poner en proceso" : "Cambiar responsable"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {arranque
          ? "Asigna al elegido y pasa el ticket a En proceso."
          : "Cambia el responsable sin modificar el estado."}
      </p>
    </div>
  );
}
