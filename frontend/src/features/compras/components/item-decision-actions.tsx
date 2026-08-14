"use client";

/**
 * ItemDecisionActions — aprobar/rechazar un ítem de compra (§4.3, S8-S11).
 * PRESENTACIONAL, gate `compra:aprobar` aplicado por el CALLER (mismo
 * criterio que el resto de `item-*.tsx` de PR-26) — PIEZA AUTÓNOMA, sin
 * cablear a `compra-detail-view.tsx`.
 *
 * S10 (`ItemCompraYaDecididoError`): `item.estadoAprobacion` YA es un campo
 * calculado por el backend — se compara por igualdad (`!== "PENDIENTE"`)
 * para deshabilitar ambos botones, sin reimplementar la máquina de un solo
 * paso. Ambas acciones van detrás de `ConfirmDialog` — no hay deshacer una
 * vez decidido.
 */
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useAprobarItemCompra, useRechazarItemCompra } from "../hooks/use-compra-mutations";
import type { ItemCompra } from "../types";

export interface ItemDecisionActionsProps {
  compraId: string;
  item: ItemCompra;
}

export function ItemDecisionActions({ compraId, item }: ItemDecisionActionsProps) {
  const aprobarMutation = useAprobarItemCompra(compraId);
  const rechazarMutation = useRechazarItemCompra(compraId);
  const yaDecidido = item.estadoAprobacion !== "PENDIENTE";
  const titleDeshabilitado = yaDecidido ? "El ítem ya fue decidido (S10)" : undefined;

  return (
    <div className="flex items-center gap-2">
      <ConfirmDialog
        trigger={
          <Button
            size="sm"
            disabled={yaDecidido}
            isLoading={aprobarMutation.isPending}
            title={titleDeshabilitado}
          >
            Aprobar
          </Button>
        }
        title="Aprobar ítem"
        description={`¿Confirmás aprobar "${item.descripcion}"?`}
        confirmLabel="Confirmar aprobación"
        isConfirming={aprobarMutation.isPending}
        onConfirm={() => aprobarMutation.mutate(item.id)}
      />
      <ConfirmDialog
        trigger={
          <Button
            variant="destructive"
            size="sm"
            disabled={yaDecidido}
            isLoading={rechazarMutation.isPending}
            title={titleDeshabilitado}
          >
            Rechazar
          </Button>
        }
        title="Rechazar ítem"
        description={`¿Confirmás rechazar "${item.descripcion}"?`}
        confirmLabel="Confirmar rechazo"
        confirmVariant="destructive"
        isConfirming={rechazarMutation.isPending}
        onConfirm={() => rechazarMutation.mutate(item.id)}
      />
    </div>
  );
}
