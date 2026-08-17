"use client";

/**
 * CompraCreateDialog — alta de una compra nueva (§4.1, S1/S2). Cierra el
 * HUECO DEL CHECKLIST detectado en `sdd/redisenio-modulo-compras/
 * hueco-compra-create-dialog`: ningún PR de la Fase F asignó el consumidor
 * de `useCrearCompra` (existente desde PR-26/27). Precedente explícito en
 * `ticket-create-dialog.tsx` ("COMPRAS: CompraCreateDialog").
 *
 * `numero`/`solicitanteId`/`cicloId` NUNCA viajan en el body (ver JSDoc de
 * `types.ts`/`schemas.ts`) — `crearCompraSchema` (PR-23) ya los excluye por
 * diseño, no se agregan acá.
 *
 * Trigger montado en `ComprasListView`, gate `COMPRAS:ALTAS` aplicado por
 * el CALLER (mismo criterio que el resto de los diálogos del módulo — este
 * componente es PRESENTACIONAL y no se auto-gatea).
 *
 * Al crear con éxito, navega al detalle de la compra nueva (mismo criterio
 * que `TicketCreateDialog`).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCrearCompra } from "../hooks/use-compra-mutations";
import { crearCompraSchema, type CrearCompraFormValues } from "../schemas";

const EMPTY: CrearCompraFormValues = { motivo: "", descripcion: "", fechaSolicitud: "" };

export function CompraCreateDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const crearMutation = useCrearCompra();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CrearCompraFormValues>({
    resolver: zodResolver(crearCompraSchema),
    defaultValues: EMPTY,
  });

  function submit(values: CrearCompraFormValues) {
    crearMutation.mutate(
      {
        motivo: values.motivo,
        descripcion: values.descripcion || undefined,
        fechaSolicitud: values.fechaSolicitud,
      },
      {
        onSuccess: (compra) => {
          setOpen(false);
          router.push(`/compras/${compra.id}`);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reset al ABRIR (mismo criterio que el resto de los diálogos de
        // alta del módulo): el formulario arranca siempre vacío.
        if (next) reset(EMPTY);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          Nueva compra
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva compra</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="compra-crear-motivo" className="text-sm font-medium text-foreground">
              Motivo
            </label>
            <Input id="compra-crear-motivo" error={!!errors.motivo} {...register("motivo")} />
            {errors.motivo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.motivo.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="compra-crear-fecha-solicitud" className="text-sm font-medium text-foreground">
              Fecha de solicitud
            </label>
            <Input
              id="compra-crear-fecha-solicitud"
              type="date"
              error={!!errors.fechaSolicitud}
              {...register("fechaSolicitud")}
            />
            {errors.fechaSolicitud && (
              <p role="alert" className="text-sm text-destructive">
                {errors.fechaSolicitud.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="compra-crear-descripcion" className="text-sm font-medium text-foreground">
              Descripción
            </label>
            <Textarea id="compra-crear-descripcion" rows={3} {...register("descripcion")} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" isLoading={crearMutation.isPending}>
              Crear
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
