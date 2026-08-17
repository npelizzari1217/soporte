"use client";

/**
 * ConfirmDialog — wraps `@radix-ui/react-alert-dialog` (dep ya instalada,
 * usada hasta ahora solo inline en `idle-warning-dialog.tsx`) en un
 * primitivo reusable con Cancelar + Confirmar, para acciones sensibles que
 * necesitan confirmación explícita antes de ejecutarse (T3.5 publicar/
 * despublicar, T3.6 eliminar). No estaba en el inventario de primitivas B0
 * — se agrega acá porque B3 es el primer batch que necesita confirmación
 * antes de una mutación (tickets no la necesitaba).
 *
 * `trigger` se monta vía `AlertDialog.Trigger asChild` — el caller controla
 * el look del disparador (ej. `<Button variant="destructive">`). Modo
 * UNCONTROLLED por default (sin `open`/`onOpenChange`, Radix maneja el
 * estado internamente vía el trigger).
 *
 * Modo CONTROLLED (`open`+`onOpenChange`, `trigger` omitido): para el caso
 * donde el diálogo se abre por una condición externa en vez de un click
 * directo sobre el trigger (ej. `CambiarRolControl` — R6: el mismo botón
 * "Guardar" hace commit directo o abre confirmación según un checkbox
 * aparte, no hay un trigger propio para el diálogo).
 */
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface ConfirmDialogProps {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "default" | "destructive";
  onConfirm: () => void;
  isConfirming?: boolean;
}

export function ConfirmDialog({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  confirmVariant = "default",
  onConfirm,
  isConfirming = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger> : null}
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <AlertDialog.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%]",
            "rounded-xl border border-white/10",
            "bg-card/95 backdrop-blur shadow-xl",
            "p-6 flex flex-col gap-4",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <AlertDialog.Title className="text-base font-semibold text-foreground">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-muted-foreground">
            {description}
          </AlertDialog.Description>

          <div className="flex items-center justify-end gap-2 pt-2">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" disabled={isConfirming}>
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant={confirmVariant} isLoading={isConfirming} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
