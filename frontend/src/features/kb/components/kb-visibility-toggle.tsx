"use client";

/**
 * KbVisibilityToggle — PRESENTATIONAL, gate `kb:gestionar` aplicado por el
 * caller (`KbDetailView`, `<Can>`). T3.5: publicar/despublicar requiere
 * confirmación explícita (`ConfirmDialog`) — nunca dispara el PATCH directo
 * desde el botón, evita publicar contenido interno por error de un click.
 */
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";

export interface KbVisibilityToggleProps {
  visible: boolean;
  onConfirm: () => void;
  isSubmitting: boolean;
}

export function KbVisibilityToggle({ visible, onConfirm, isSubmitting }: KbVisibilityToggleProps) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm" isLoading={isSubmitting}>
          {visible ? "Despublicar" : "Publicar"}
        </Button>
      }
      title={visible ? "Despublicar artículo" : "Publicar artículo"}
      description={
        visible
          ? "El artículo dejará de ser visible para los solicitantes (rol USUARIO)."
          : "El artículo será visible para los solicitantes (rol USUARIO)."
      }
      confirmLabel={visible ? "Despublicar" : "Publicar"}
      onConfirm={onConfirm}
      isConfirming={isSubmitting}
    />
  );
}
