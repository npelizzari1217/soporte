"use client";

import * as React from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * IdleWarningDialog — aviso de cuenta regresiva antes del corte por inactividad.
 *
 * SIN botón "Cancelar": una sola acción explícita posible ("Seguir conectado").
 * NO cierra por ESC ni click en el overlay (semántica AlertDialog de decisión
 * forzada) — el usuario no puede descartar el aviso por accidente y quedar
 * deslogueado sin enterarse.
 *
 * `open` es 100% derivado de `isWarning` del hook `useIdleTimeout` — el diálogo
 * es puramente presentacional, no gestiona su propio estado de apertura.
 *
 * Spec: PR11 — idle-timeout (aviso 60s antes del corte, "Seguir conectado").
 */

export interface IdleWarningDialogProps {
  open: boolean;
  secondsLeft: number;
  onStayConnected: () => void;
}

function IdleWarningDialog({ open, secondsLeft, onStayConnected }: IdleWarningDialogProps) {
  const stayConnectedRef = React.useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog.Root open={open} onOpenChange={() => {}}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <AlertDialog.Content
          onEscapeKeyDown={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            stayConnectedRef.current?.focus();
          }}
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
          <AlertDialog.Title className="text-base font-semibold">
            Tu sesión está por expirar
          </AlertDialog.Title>

          <AlertDialog.Description className="text-sm text-muted-foreground">
            Por tu seguridad, vamos a cerrar la sesión en{" "}
            <span role="timer" aria-live="polite" className="font-semibold text-foreground">
              {secondsLeft}
            </span>{" "}
            segundos por inactividad. Hacé clic en &quot;Seguir conectado&quot; para continuar.
          </AlertDialog.Description>

          <div className="flex items-center justify-end gap-2 pt-2">
            <AlertDialog.Action asChild>
              <Button ref={stayConnectedRef} onClick={onStayConnected}>
                Seguir conectado
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
IdleWarningDialog.displayName = "IdleWarningDialog";

export { IdleWarningDialog };
