"use client";

/**
 * KbDeleteControl — PRESENTATIONAL, gate `KB:BORRADO` aplicado por el
 * caller (`KbDetailView`, `<Can>`). T3.6: baja lógica (soft delete), siempre
 * detrás de confirmación explícita (`ConfirmDialog`).
 */
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";

export interface KbDeleteControlProps {
  onConfirm: () => void;
  isSubmitting: boolean;
}

export function KbDeleteControl({ onConfirm, isSubmitting }: KbDeleteControlProps) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="destructive" size="sm" isLoading={isSubmitting}>
          Eliminar
        </Button>
      }
      title="Eliminar artículo"
      description="Esta acción no se puede deshacer. El artículo dejará de estar disponible para todos los roles."
      confirmLabel="Eliminar"
      confirmVariant="destructive"
      onConfirm={onConfirm}
      isConfirming={isSubmitting}
    />
  );
}
