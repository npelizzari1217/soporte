"use client";

/**
 * ClienteAcciones — PRESENTATIONAL. Acciones de fila del ABM de clientes:
 * Ver (detalle read-only), Editar (datos comerciales) y Activar/Desactivar.
 *
 * Desactivar va detrás de `ConfirmDialog` (baja lógica con efecto no trivial
 * de comunicar: el tenant queda inactivo, aunque su DB NO se elimina y es
 * reversible). Activar es directo (revierte la baja, sin cascada).
 */
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { VerClienteDialog } from "./ver-cliente-dialog";
import { EditarClienteDialog } from "./editar-cliente-dialog";
import { useActivarCliente, useDesactivarCliente } from "../hooks/use-clientes-mutations";
import type { Cliente } from "../types";

export interface ClienteAccionesProps {
  cliente: Cliente;
}

export function ClienteAcciones({ cliente }: ClienteAccionesProps) {
  const activar = useActivarCliente();
  const desactivar = useDesactivarCliente();

  return (
    <div className="flex items-center gap-2">
      <VerClienteDialog cliente={cliente} />
      <EditarClienteDialog cliente={cliente} />
      {cliente.activo ? (
        <ConfirmDialog
          trigger={
            <Button variant="destructive" size="sm">
              Desactivar
            </Button>
          }
          title="Desactivar cliente"
          description={`¿Confirmás desactivar "${cliente.nombre}"? El cliente quedará inactivo; se puede reactivar. La base de datos NO se elimina.`}
          confirmLabel="Desactivar"
          confirmVariant="destructive"
          isConfirming={desactivar.isPending}
          onConfirm={() => desactivar.mutate(cliente.id)}
        />
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={activar.isPending}
          onClick={() => activar.mutate(cliente.id)}
        >
          Activar
        </Button>
      )}
    </div>
  );
}
