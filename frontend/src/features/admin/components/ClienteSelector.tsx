"use client";

/**
 * ClienteSelector — dropdown de selección de tenant, exclusivo del operador global.
 *
 * Renderiza `null` para cualquier usuario sin `is_global_admin: true` (invariante de
 * UI; la autorización real la impone el backend vía GlobalAdminGuard/TenantGuard).
 *
 * Al seleccionar un cliente, actualiza `TenantContext.clienteId/clienteNombre`.
 * TenantContext dispara internamente el re-fetch del ciclo activo del nuevo cliente
 * (cascade — ver shared/providers/tenant-context.tsx), por lo que el CicloSelector
 * se resetea automáticamente sin lógica adicional acá.
 *
 * Diseño (CLAUDE.md §3): label uppercase `text-xs tracking-wider`, trigger
 * `rounded-xl` (Select atom), skeleton tenue durante la carga inicial — sin
 * spinner de pantalla completa.
 *
 * Spec: [SPEC:admin-ui/Selectores — Operador ve ambos selectores]
 */

import { useContext } from "react";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/shared/hooks/use-session";
import { TenantContext } from "@/shared/providers/tenant-context";
import { useClientes } from "../hooks/use-clientes";

export function ClienteSelector() {
  const { isGlobalAdmin } = useSession();
  const { clienteId, setCliente } = useContext(TenantContext);
  const { data: clientes, isLoading } = useClientes();

  if (!isGlobalAdmin) return null;

  if (isLoading) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor="cliente-selector">Cliente</Label>
        <Skeleton
          data-testid="cliente-selector-skeleton"
          className="h-10 w-full rounded-xl"
        />
      </div>
    );
  }

  const options = (clientes ?? []).map((cliente) => ({
    value: cliente.id,
    label: cliente.nombre,
  }));

  function handleChange(value: string) {
    const cliente = clientes?.find((c) => c.id === value);
    setCliente(value, cliente?.nombre ?? null);
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="cliente-selector">Cliente</Label>
      <Select
        id="cliente-selector"
        aria-label="Seleccionar cliente"
        value={clienteId ?? undefined}
        onValueChange={handleChange}
        options={options}
        placeholder="Seleccionar cliente..."
      />
    </div>
  );
}
