"use client";

/**
 * CompraDecisionActions — aprobar/rechazar una compra (T5.5/T5.6, ADR-1/
 * ADR-2 backend). Aprobar NUNCA cambia el estado del ticket (solo el
 * satélite `ticket_compra`); rechazar SÍ transiciona el ticket base a
 * CANCELADO (lo hace el backend, el front solo invoca el endpoint y
 * refleja el resultado vía `TicketCompra.motivoRechazo`/`aprobadoEn`).
 * Ambas acciones quedan ocultas una vez decidida la compra (idempotencia
 * de UI, espejo de `CompraYaDecididaError`).
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Can } from "@/components/shared/can";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAprobarCompra, useRechazarCompra } from "../hooks/use-compra-mutations";
import { rechazarCompraSchema, type RechazarCompraFormValues } from "../schemas";
import type { TicketCompra } from "../types";

export interface CompraDecisionActionsProps {
  compra: TicketCompra;
}

function RechazarCompraDialog({ ticketId }: { ticketId: string }) {
  const [open, setOpen] = useState(false);
  const rechazarMutation = useRechazarCompra();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RechazarCompraFormValues>({ resolver: zodResolver(rechazarCompraSchema) });

  function submit(values: RechazarCompraFormValues) {
    rechazarMutation.mutate(
      { ticketId, dto: values },
      {
        onSuccess: () => {
          setOpen(false);
          reset();
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive">Rechazar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rechazar compra</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="rechazar-motivo" className="text-sm font-medium text-foreground">
              Motivo del rechazo
            </label>
            <Textarea id="rechazar-motivo" error={!!errors.motivoRechazo} {...register("motivoRechazo")} />
            {errors.motivoRechazo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.motivoRechazo.message}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="submit" variant="destructive" isLoading={rechazarMutation.isPending}>
              Confirmar rechazo
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CompraDecisionActions({ compra }: CompraDecisionActionsProps) {
  const aprobarMutation = useAprobarCompra();

  if (compra.aprobadoEn) return null;

  return (
    <div className="flex items-center gap-2">
      <Can permiso="compra:aprobar">
        <ConfirmDialog
          trigger={<Button>Aprobar</Button>}
          title="Aprobar compra"
          description={`¿Confirmás aprobar el ticket de compra "${compra.titulo}"?`}
          confirmLabel="Aprobar"
          isConfirming={aprobarMutation.isPending}
          onConfirm={() => aprobarMutation.mutate(compra.ticketId)}
        />
      </Can>
      <Can permiso="ticket:rechazar">
        <RechazarCompraDialog ticketId={compra.ticketId} />
      </Can>
    </div>
  );
}
