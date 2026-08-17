"use client";

/**
 * CambiarRolControl — PRESENTATIONAL. Cambia el rol de la membresía de un
 * usuario EN EL TENANT DEL ACTOR (T4.7). Reversible (no destructivo) — sin
 * `ConfirmDialog` para el cambio de rol en sí.
 *
 * `reaplicarPreset` (R6, `sdd/matriz-permisos-por-usuario/confirmacion-r6`):
 * checkbox opcional, default sin tildar. Sin tildar → `PATCH` sin el flag,
 * la matriz de permisos del usuario queda INTACTA (comportamiento de
 * siempre, sin confirmación). Tildado → SOBRESCRIBE la matriz con el preset
 * del rol destino, así que SIEMPRE pide confirmación explícita antes de
 * enviarlo (pisa cualquier ajuste fino hecho a mano en la grilla).
 */
import { useState } from "react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useCambiarRolUsuarioTenant } from "../hooks/use-usuarios-tenant-mutations";
import { useRoles } from "../hooks/use-roles";
import type { UsuarioTenant } from "../types";

export interface CambiarRolControlProps {
  usuario: UsuarioTenant;
}

export function CambiarRolControl({ usuario }: CambiarRolControlProps) {
  const [rolCodigo, setRolCodigo] = useState(usuario.rol);
  const [reaplicarPreset, setReaplicarPreset] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const mutation = useCambiarRolUsuarioTenant(usuario.id);
  const rolesQuery = useRoles();

  function guardar() {
    if (reaplicarPreset) {
      setConfirmando(true);
      return;
    }
    mutation.mutate({ rolCodigo });
  }

  function confirmarConPreset() {
    mutation.mutate({ rolCodigo, reaplicarPreset: true });
    setConfirmando(false);
  }

  return (
    <div className="flex flex-col gap-1.5">
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
          isLoading={mutation.isPending && !reaplicarPreset}
          disabled={rolCodigo === usuario.rol}
          onClick={guardar}
        >
          Guardar
        </Button>
      </div>
      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title="Reaplicar preset de permisos"
        description={`Vas a SOBRESCRIBIR la matriz de permisos de "${usuario.nombre} ${usuario.apellido}" con el preset del rol destino (${rolCodigo}). Cualquier ajuste manual hecho en la grilla se pierde. ¿Confirmás?`}
        confirmLabel="Confirmar"
        onConfirm={confirmarConPreset}
        isConfirming={mutation.isPending}
      />
      <Label
        htmlFor={`reaplicar-preset-${usuario.id}`}
        className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground"
      >
        <Checkbox
          id={`reaplicar-preset-${usuario.id}`}
          checked={reaplicarPreset}
          disabled={mutation.isPending}
          onCheckedChange={(checked) => setReaplicarPreset(checked === true)}
        />
        Reaplicar preset del rol destino (sobrescribe la matriz)
      </Label>
    </div>
  );
}
