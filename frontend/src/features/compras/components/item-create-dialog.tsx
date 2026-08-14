"use client";

/**
 * ItemCreateDialog — alta de un ítem de compra (§4.2, S4/S5). PIEZA
 * AUTÓNOMA (PR-26): consume `useAgregarItemCompra`/`agregarItemCompraSchema`
 * (PR-23), pero NO se cablea a `compra-detail-view.tsx` — eso lo hace el
 * orquestador cuando aterrice el detalle (reparto declarado del batch).
 *
 * RBAC: `POST /compras/:id/items` requiere `compra:gestionar` — el gateo de
 * UI (mostrar/ocultar el trigger con `<Can permiso="compra:gestionar">`) es
 * responsabilidad del CALLER, mismo criterio que `KbDeleteControl`/
 * `KbVisibilityToggle` (`kb-delete-control.tsx`, `kb-visibility-toggle.tsx`)
 * — este componente es PRESENTACIONAL y no se auto-gatea. El backend igual
 * responde 403 si se intenta sin permiso.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAgregarItemCompra } from "../hooks/use-compra-mutations";
import { agregarItemCompraSchema, type AgregarItemCompraFormValues } from "../schemas";

export interface ItemCreateDialogProps {
  compraId: string;
}

const EMPTY: AgregarItemCompraFormValues = {
  descripcion: "",
  cantidad: 0,
  proveedor: "",
  monto: 0,
  moneda: "ARS",
  fechaCotizacion: "",
  observaciones: "",
};

export function ItemCreateDialog({ compraId }: ItemCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const agregarMutation = useAgregarItemCompra(compraId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AgregarItemCompraFormValues>({
    resolver: zodResolver(agregarItemCompraSchema),
    defaultValues: EMPTY,
  });

  function submit(values: AgregarItemCompraFormValues) {
    agregarMutation.mutate(
      {
        descripcion: values.descripcion,
        cantidad: values.cantidad,
        proveedor: values.proveedor,
        monto: values.monto,
        moneda: values.moneda,
        fechaCotizacion: values.fechaCotizacion,
        observaciones: values.observaciones || undefined,
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reset al ABRIR (mismo criterio que ComponenteCreateDialog): el
        // formulario arranca siempre vacío, aunque un alta anterior se haya
        // cerrado a medio completar.
        if (next) reset(EMPTY);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          Agregar ítem
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar ítem</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="item-crear-descripcion" className="text-sm font-medium text-foreground">
              Descripción
            </label>
            <Input id="item-crear-descripcion" error={!!errors.descripcion} {...register("descripcion")} />
            {errors.descripcion && (
              <p role="alert" className="text-sm text-destructive">
                {errors.descripcion.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="item-crear-cantidad" className="text-sm font-medium text-foreground">
              Cantidad
            </label>
            <Input
              id="item-crear-cantidad"
              type="number"
              step="0.01"
              min="0"
              error={!!errors.cantidad}
              {...register("cantidad")}
            />
            {errors.cantidad && (
              <p role="alert" className="text-sm text-destructive">
                {errors.cantidad.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="item-crear-proveedor" className="text-sm font-medium text-foreground">
              Proveedor
            </label>
            <Input id="item-crear-proveedor" error={!!errors.proveedor} {...register("proveedor")} />
            {errors.proveedor && (
              <p role="alert" className="text-sm text-destructive">
                {errors.proveedor.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="item-crear-monto" className="text-sm font-medium text-foreground">
              Monto
            </label>
            <Input
              id="item-crear-monto"
              type="number"
              step="0.01"
              min="0"
              error={!!errors.monto}
              {...register("monto")}
            />
            {errors.monto && (
              <p role="alert" className="text-sm text-destructive">
                {errors.monto.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="item-crear-moneda" className="text-sm font-medium text-foreground">
              Moneda
            </label>
            <Select id="item-crear-moneda" error={!!errors.moneda} {...register("moneda")}>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </Select>
            {errors.moneda && (
              <p role="alert" className="text-sm text-destructive">
                {errors.moneda.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="item-crear-fecha-cotizacion" className="text-sm font-medium text-foreground">
              Fecha de cotización
            </label>
            <Input
              id="item-crear-fecha-cotizacion"
              type="date"
              error={!!errors.fechaCotizacion}
              {...register("fechaCotizacion")}
            />
            {errors.fechaCotizacion && (
              <p role="alert" className="text-sm text-destructive">
                {errors.fechaCotizacion.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="item-crear-observaciones" className="text-sm font-medium text-foreground">
              Observaciones
            </label>
            <Textarea id="item-crear-observaciones" rows={3} {...register("observaciones")} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" isLoading={agregarMutation.isPending}>
              Agregar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
