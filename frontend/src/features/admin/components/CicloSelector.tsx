"use client";

/**
 * CicloSelector — dropdown de selección de ciclo, visible para operador global y
 * ADMINISTRADOR. Ausente para roles operativos (USUARIO, COLABORADOR, TECNICO) —
 * el ciclo activo se resuelve implícitamente desde el JWT para esos usuarios
 * (TenantContext ya lo hace, ver shared/providers/tenant-context.tsx).
 *
 * El valor por defecto (ciclo activo) llega vía `TenantContext.cicloId`, resuelto
 * automáticamente al montar o al cambiar de cliente. `useCiclos` provee la lista
 * completa de opciones y re-fetchea cuando `TenantContext.clienteId` cambia
 * (queryKey incluye clienteId).
 *
 * Diseño (CLAUDE.md §3): label uppercase `text-xs tracking-wider`, trigger
 * `rounded-xl`, skeleton durante la carga inicial.
 *
 * Spec: [SPEC:admin-ui/Selectores — Admin-cliente ve solo selector de Ciclo]
 */

import { useContext } from "react";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/shared/hooks/use-session";
import { TenantContext } from "@/shared/providers/tenant-context";
import { useCiclos } from "../hooks/use-ciclos";

export function CicloSelector() {
  const { isGlobalAdmin, user } = useSession();
  const { cicloId, setCiclo } = useContext(TenantContext);
  const { data: ciclos, isLoading } = useCiclos();

  const isAdministrador = user?.roles.includes("ADMINISTRADOR") ?? false;
  const visible = isGlobalAdmin || isAdministrador;

  if (!visible) return null;

  if (isLoading) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor="ciclo-selector">Ciclo</Label>
        <Skeleton
          data-testid="ciclo-selector-skeleton"
          className="h-10 w-full rounded-xl"
        />
      </div>
    );
  }

  const options = (ciclos ?? []).map((ciclo) => ({
    value: ciclo.id,
    label: ciclo.nombre,
  }));

  function handleChange(value: string) {
    const ciclo = ciclos?.find((c) => c.id === value);
    setCiclo(value, ciclo?.nombre ?? null);
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="ciclo-selector">Ciclo</Label>
      <Select
        id="ciclo-selector"
        aria-label="Seleccionar ciclo"
        value={cicloId ?? undefined}
        onValueChange={handleChange}
        options={options}
        placeholder="Seleccionar ciclo..."
      />
    </div>
  );
}
