"use client";

/**
 * DesactivarMembresiaControl — PRESENTATIONAL. Desactiva la membresía del
 * usuario EN EL TENANT DEL ACTOR (T4.7) — no borra el usuario global.
 * Destructivo (pierde acceso al tenant) → SIEMPRE detrás de `ConfirmDialog`.
 */
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useDesactivarMembresiaUsuarioTenant } from "../hooks/use-usuarios-tenant-mutations";
import type { UsuarioTenant } from "../types";

export interface DesactivarMembresiaControlProps {
  usuario: UsuarioTenant;
}

export function DesactivarMembresiaControl({ usuario }: DesactivarMembresiaControlProps) {
  const mutation = useDesactivarMembresiaUsuarioTenant(usuario.id);

  return (
    <ConfirmDialog
      trigger={
        <Button variant="destructive" size="sm">
          Desactivar
        </Button>
      }
      title="Desactivar membresía"
      description={`¿Confirmás desactivar la membresía de "${usuario.nombre} ${usuario.apellido}" en este tenant? Pierde acceso, no se borra el usuario global.`}
      confirmLabel="Desactivar"
      confirmVariant="destructive"
      isConfirming={mutation.isPending}
      onConfirm={() => mutation.mutate()}
    />
  );
}
