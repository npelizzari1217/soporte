"use client";

/**
 * CambiarRolControl — PRESENTATIONAL. Cambia el rol de la membresía de un
 * usuario EN EL TENANT DEL ACTOR (T4.7). Reversible (no destructivo) — sin
 * `ConfirmDialog`, a diferencia de desactivar membresía.
 */
import { useState } from "react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useCambiarRolUsuarioTenant } from "../hooks/use-usuarios-tenant-mutations";
import { useRoles } from "../hooks/use-roles";
import type { UsuarioTenant } from "../types";

export interface CambiarRolControlProps {
  usuario: UsuarioTenant;
}

export function CambiarRolControl({ usuario }: CambiarRolControlProps) {
  const [rolCodigo, setRolCodigo] = useState(usuario.rol);
  const mutation = useCambiarRolUsuarioTenant(usuario.id);
  const rolesQuery = useRoles();

  return (
    <div className="flex items-center gap-2">
      <Select
        aria-label={`Rol de ${usuario.nombre}`}
        value={rolCodigo}
        onChange={(e) => setRolCodigo(e.target.value)}
        disabled={mutation.isPending}
      >
        {(rolesQuery.data ?? []).map((rol) => (
          <option key={rol.id} value={rol.codigo}>
            {rol.nombre}
          </option>
        ))}
      </Select>
      <Button
        type="button"
        size="sm"
        variant="outline"
        isLoading={mutation.isPending}
        disabled={rolCodigo === usuario.rol}
        onClick={() => mutation.mutate({ rolCodigo })}
      >
        Guardar
      </Button>
    </div>
  );
}
