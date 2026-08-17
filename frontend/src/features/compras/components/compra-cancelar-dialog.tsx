"use client";

/**
 * CompraCancelarDialog — cancela una compra completa (§4.8, S27-S31). PIEZA
 * AUTÓNOMA de PR-27, sin cablear a `compra-detail-view.tsx`.
 *
 * **Gate DELIBERADAMENTE PARCIAL — sin re-implementar S29**: `compra.
 * canceladaEn`/`compra.cerrado` YA son campos de CABECERA calculados por el
 * backend (S30/S28) — se leen directamente para deshabilitar el trigger.
 * S29 (WU-29, `CompraConOrdenEmitidaError`, "con ALGÚN ítem con
 * cantidadOrdenada > 0") NO se replica acá: exigiría un `.some(item =>
 * item.cantidadOrdenada > 0)` sobre `compra.items`, exactamente la trampa
 * que el prompt prohíbe ("cero lógica condicional sobre ítems para derivar
 * estado" / "si te encontrás escribiendo un .every()/.some() sobre ítems,
 * PARÁ"). El botón queda habilitado en ese caso y el backend responde 422
 * (S29) — el mensaje real llega vía `notifyError`, no un "algo salió mal".
 *
 * Requiere motivo (10º throw plano del backend, cubierto por
 * `cancelarCompraSchema` de PR-23) — `Dialog` con formulario, no
 * `ConfirmDialog` sin campos (mismo criterio que `ItemCerrarFaltanteDialog`).
 *
 * RBAC: gate `COMPRAS:BORRADO` aplicado por el CALLER.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCancelarCompra } from "../hooks/use-compra-mutations";
import { cancelarCompraSchema, type CancelarCompraFormValues } from "../schemas";
import type { CompraDetalle } from "../types";

export interface CompraCancelarDialogProps {
  compra: CompraDetalle;
}

const EMPTY: CancelarCompraFormValues = { motivo: "" };

export function CompraCancelarDialog({ compra }: CompraCancelarDialogProps) {
  const [open, setOpen] = useState(false);
  const cancelarMutation = useCancelarCompra(compra.id);
  const yaCancelada = compra.canceladaEn !== null;
  const yaCerrada = compra.cerrado;
  const bloqueada = yaCancelada || yaCerrada;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CancelarCompraFormValues>({
    resolver: zodResolver(cancelarCompraSchema),
    defaultValues: EMPTY,
  });

  function submit(values: CancelarCompraFormValues) {
    cancelarMutation.mutate({ motivo: values.motivo }, { onSuccess: () => setOpen(false) });
  }

  const titleBloqueada = yaCancelada
    ? "La compra ya está cancelada (S30)"
    : yaCerrada
      ? "La compra ya está cerrada (S28)"
      : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset(EMPTY);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm" disabled={bloqueada} title={titleBloqueada}>
          Cancelar compra
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar compra {compra.numero}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          <p className="text-xs text-muted-foreground">
            Esta acción no se puede deshacer. Si la compra tiene compras registradas, cerrala con
            faltante por ítem en vez de cancelarla (S29).
          </p>
          <div className="flex flex-col gap-1">
            <label htmlFor="cancelar-compra-motivo" className="text-sm font-medium text-foreground">
              Motivo
            </label>
            <Textarea id="cancelar-compra-motivo" rows={3} error={!!errors.motivo} {...register("motivo")} />
            {errors.motivo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.motivo.message}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" variant="destructive" isLoading={cancelarMutation.isPending}>
              Confirmar cancelación
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
