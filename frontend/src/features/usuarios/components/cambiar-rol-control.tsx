"use client";

/**
 * CambiarRolControl — PRESENTATIONAL. Cambia el rol de la membresía de un
 * usuario EN EL TENANT DEL ACTOR (T4.7). Reversible (no destructivo) — sin
 * `ConfirmDialog`: el cambio de rol NUNCA toca la matriz de permisos.
 *
 * Acá hubo un checkbox "reaplicar preset del rol destino". Se dio de baja
 * porque quedaba atado a este `Guardar`, deshabilitado mientras el rol no
 * cambie: era imposible reaplicarle la plantilla a alguien sin además moverlo
 * de rol. Reaplicar una plantilla es una operación de PERMISOS y hoy vive en
 * `AsignarPermisosControl` ("Reaplicar plantilla del rol", con su propia
 * confirmación). El campo `reaplicarPreset` sigue soportado por el backend por
 * retrocompatibilidad; este control ya no lo manda.
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

  function guardar() {
    mutation.mutate({ rolCodigo });
  }

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
        onClick={guardar}
      >
        Guardar
      </Button>
    </div>
  );
}
