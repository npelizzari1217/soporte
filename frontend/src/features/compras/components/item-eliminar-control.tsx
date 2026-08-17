"use client";

/**
 * ItemEliminarControl — baja lógica de un ítem PENDIENTE/RECHAZADO (§4.2,
 * S6/S7). PRESENTACIONAL, gate `COMPRAS:BORRADO` aplicado por el CALLER
 * (mismo criterio que `KbDeleteControl`) — PIEZA AUTÓNOMA de PR-26, sin
 * cablear a `compra-detail-view.tsx`.
 *
 * S7 (`ItemCompraAprobadoNoEliminableError`): `item.estadoAprobacion` YA es
 * un campo calculado por el backend — se compara por igualdad para
 * deshabilitar el trigger, sin reimplementar la regla de negocio. Siempre
 * detrás de `ConfirmDialog` (destructivo, irreversible en la práctica).
 */
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useEliminarItemCompra } from "../hooks/use-compra-mutations";
import type { ItemCompra } from "../types";

export interface ItemEliminarControlProps {
  compraId: string;
  item: ItemCompra;
}

export function ItemEliminarControl({ compraId, item }: ItemEliminarControlProps) {
  const eliminarMutation = useEliminarItemCompra(compraId);
  const noEliminable = item.estadoAprobacion === "APROBADO";

  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="destructive"
          size="sm"
          disabled={noEliminable}
          isLoading={eliminarMutation.isPending}
          title={noEliminable ? "Un ítem aprobado no se puede eliminar (S7)" : undefined}
        >
          Eliminar
        </Button>
      }
      title="Eliminar ítem"
      description={`¿Confirmás eliminar "${item.descripcion}"? Esta acción no se puede deshacer.`}
      confirmLabel="Confirmar eliminación"
      confirmVariant="destructive"
      isConfirming={eliminarMutation.isPending}
      onConfirm={() => eliminarMutation.mutate(item.id)}
    />
  );
}
