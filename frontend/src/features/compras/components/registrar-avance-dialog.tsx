"use client";

/**
 * RegistrarCompraDialog / RegistrarEntregaDialog — registran el ACUMULADO
 * de cantidad comprada/entregada de un ítem (§4.5 S15-S18, §4.6 S19-S21).
 * PIEZAS AUTÓNOMAS de PR-27, sin cablear a `compra-detail-view.tsx`.
 *
 * Viven en el mismo archivo porque son estructuralmente idénticas (un único
 * input numérico ACUMULADO + el mismo shell de diálogo) — separarlas en dos
 * archivos duplicaría el shell sin ganar nada (DRY); cada una mantiene su
 * propio `useForm`/schema porque el nombre del campo difiere
 * (`cantidadComprada` vs `cantidadEntregada`, tipos DTO distintos).
 *
 * **Gating SIN reimplementar el dominio**: los tres campos que leen
 * (`estadoAprobacion`, `cantidadComprada`, `cerradoConFaltante`) YA los
 * calcula/persiste el backend — acá solo se comparan por igualdad/mayor-que
 * para habilitar el trigger, nunca se agrega un `.every()`/`.some()` sobre
 * ítems (eso violaría el requisito duro de "cero lógica condicional sobre
 * ítems para derivar estado"). Si el front se equivoca al habilitar un
 * botón, el backend igual responde 422 (S16/S17/S18/S20/S21) y el mensaje
 * real llega vía `notifyError` — el gate es UX, no la autoridad.
 *
 * RBAC: gate `COMPRAS:MODIFICACION` aplicado por el CALLER.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useRegistrarCompraDeItem,
  useRegistrarEntregaDeItem,
} from "../hooks/use-compra-mutations";
import {
  registrarCompraDeItemSchema,
  registrarEntregaDeItemSchema,
  type RegistrarCompraDeItemFormValues,
  type RegistrarEntregaDeItemFormValues,
} from "../schemas";
import type { ItemCompra } from "../types";

export interface RegistrarAvanceDialogProps {
  compraId: string;
  item: ItemCompra;
}

/** S16: solo un ítem APROBADO puede registrar compra; TERMINAL si ya cerró con faltante (S25). */
export function RegistrarCompraDialog({ compraId, item }: RegistrarAvanceDialogProps) {
  const [open, setOpen] = useState(false);
  const registrarMutation = useRegistrarCompraDeItem(compraId);
  const puedeRegistrar = item.estadoAprobacion === "APROBADO" && !item.cerradoConFaltante;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<RegistrarCompraDeItemFormValues>({
    resolver: zodResolver(registrarCompraDeItemSchema),
    defaultValues: { cantidadComprada: item.cantidadComprada },
  });

  /**
   * El campo viene precargado con el acumulado actual, así que "abrir y guardar"
   * sin tocar nada manda el mismo valor: el dominio lo acepta como idempotente
   * (no excede ni retrocede) y el caso de uso registra igual una `OperacionCompra`
   * que no refleja ningún cambio. El gate va acá, en el origen del ruido, y no en
   * el dominio: mandar el acumulado por API es legítimo, y hacer condicional la
   * escritura de bitácora debilitaría la defensa de ADR-C4.
   */
  const sinCambio = Number(watch("cantidadComprada")) === item.cantidadComprada;

  function submit(values: RegistrarCompraDeItemFormValues) {
    registrarMutation.mutate(
      { itemId: item.id, dto: { cantidadComprada: values.cantidadComprada } },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset({ cantidadComprada: item.cantidadComprada });
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          disabled={!puedeRegistrar}
          title={puedeRegistrar ? undefined : "El ítem debe estar aprobado y no cerrado con faltante (S16/S25)"}
        >
          Registrar compra
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar compra — {item.descripcion}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          <p className="text-xs text-muted-foreground">
            Cantidad ACUMULADA comprada hasta ahora (no un incremento) — solicitado: {item.cantidad}.
          </p>
          <div className="flex flex-col gap-1">
            <label htmlFor="registrar-compra-cantidad" className="text-sm font-medium text-foreground">
              Cantidad comprada
            </label>
            <Input
              id="registrar-compra-cantidad"
              type="number"
              step="0.01"
              min="0"
              error={!!errors.cantidadComprada}
              {...register("cantidadComprada")}
            />
            {errors.cantidadComprada && (
              <p role="alert" className="text-sm text-destructive">
                {errors.cantidadComprada.message}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="submit"
              isLoading={registrarMutation.isPending}
              disabled={sinCambio}
              title={sinCambio ? "No cambiaste el acumulado comprado" : undefined}
            >
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Requiere `cantidadComprada > 0` (si no, cualquier entrega excede lo comprado, S20). */
export function RegistrarEntregaDialog({ compraId, item }: RegistrarAvanceDialogProps) {
  const [open, setOpen] = useState(false);
  const registrarMutation = useRegistrarEntregaDeItem(compraId);
  const puedeRegistrar = item.cantidadComprada > 0 && !item.cerradoConFaltante;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<RegistrarEntregaDeItemFormValues>({
    resolver: zodResolver(registrarEntregaDeItemSchema),
    defaultValues: { cantidadEntregada: item.cantidadEntregada },
  });

  /** Mismo criterio que `RegistrarCompraDialog`: ver el JSDoc de `sinCambio` allá. */
  const sinCambio = Number(watch("cantidadEntregada")) === item.cantidadEntregada;

  function submit(values: RegistrarEntregaDeItemFormValues) {
    registrarMutation.mutate(
      { itemId: item.id, dto: { cantidadEntregada: values.cantidadEntregada } },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset({ cantidadEntregada: item.cantidadEntregada });
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          disabled={!puedeRegistrar}
          title={puedeRegistrar ? undefined : "Todavía no hay nada comprado que entregar (S20/S25)"}
        >
          Registrar entrega
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar entrega — {item.descripcion}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          <p className="text-xs text-muted-foreground">
            Cantidad ACUMULADA entregada hasta ahora (no un incremento) — comprado: {item.cantidadComprada}.
          </p>
          <div className="flex flex-col gap-1">
            <label htmlFor="registrar-entrega-cantidad" className="text-sm font-medium text-foreground">
              Cantidad entregada
            </label>
            <Input
              id="registrar-entrega-cantidad"
              type="number"
              step="0.01"
              min="0"
              error={!!errors.cantidadEntregada}
              {...register("cantidadEntregada")}
            />
            {errors.cantidadEntregada && (
              <p role="alert" className="text-sm text-destructive">
                {errors.cantidadEntregada.message}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="submit"
              isLoading={registrarMutation.isPending}
              disabled={sinCambio}
              title={sinCambio ? "No cambiaste el acumulado entregado" : undefined}
            >
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
