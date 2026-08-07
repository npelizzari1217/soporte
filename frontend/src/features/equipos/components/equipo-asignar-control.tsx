"use client";

/**
 * EquipoAsignarControl — asigna/desasigna un equipo a un usuario (T5.15).
 * Gate `equipo:gestionar`. Reusa `useUsuariosAsignables` (G2, B1) — mismo
 * catálogo que "Asignar ticket". Selector vacío = desasignar (`asignadoAId`
 * ausente/null, espejo backend).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Can } from "@/components/shared/can";
import { useUsuariosAsignables } from "@/features/tickets/hooks/use-usuarios-asignables";
import { useAsignarEquipo } from "../hooks/use-equipo-mutations";

export interface EquipoAsignarControlProps {
  equipoId: string;
  asignadoActualId: string | null;
}

export function EquipoAsignarControl({ equipoId, asignadoActualId }: EquipoAsignarControlProps) {
  const usuariosQuery = useUsuariosAsignables();
  const asignarMutation = useAsignarEquipo(equipoId);
  const [seleccionado, setSeleccionado] = useState(asignadoActualId ?? "");

  return (
    <Can permiso="equipo:gestionar">
      <div className="flex items-center gap-2">
        <Select
          aria-label="Asignar equipo a"
          value={seleccionado}
          onChange={(e) => setSeleccionado(e.target.value)}
          disabled={asignarMutation.isPending}
        >
          <option value="">Sin asignar</option>
          {(usuariosQuery.data ?? []).map((usuario) => (
            <option key={usuario.id} value={usuario.id}>
              {usuario.nombre} {usuario.apellido}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          size="sm"
          isLoading={asignarMutation.isPending}
          onClick={() => asignarMutation.mutate({ asignadoAId: seleccionado || null })}
        >
          Asignar
        </Button>
      </div>
    </Can>
  );
}
