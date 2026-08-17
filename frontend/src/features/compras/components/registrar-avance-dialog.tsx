"use client";

/**
 * RegistrarOrdenDialog / RegistrarRecepcionDialog / RegistrarEntregaDialog —
 * registran el ACUMULADO de cantidad ordenada/recibida/entregada de un ítem,
 * las TRES etapas de ejecución (`compras-tres-etapas-y-sectores` R1/R2,
 * S42-S47). PIEZAS AUTÓNOMAS, sin cablear a `compra-detail-view.tsx`.
 *
 * Las tres viven en el mismo archivo porque son estructuralmente idénticas
 * (un input numérico ACUMULADO + un input de fecha + el mismo shell de
 * diálogo) — separarlas duplicaría el shell sin ganar nada (DRY); cada una
 * mantiene su propio `useForm`/schema porque el nombre del campo difiere.
 *
 * **Prellenado (R4/S51, decisión del usuario — fechas prellenadas con hoy y
 * editables)**: el campo de FECHA se prellena con la fecha ya registrada de
 * esa etapa si existe, o con hoy si todavía no se registró nada. El campo de
 * CANTIDAD es ACUMULADO, no incremento — el default correcto cuando todavía
 * no hay nada registrado en esa etapa es el TECHO de la etapa (`item.cantidad`
 * para ORDEN, `cantidadOrdenada` para RECEPCION, `cantidadRecibida` para
 * ENTREGA), NUNCA una resta tipo "pedido − ya registrado": ese campo no
 * representa "lo que falta", representa el acumulado total que el usuario
 * quiere dejar asentado.
 *
 * **Gating SIN reimplementar el dominio**: los campos que leen
 * (`estadoAprobacion`, las tres cantidades, `cerradoConFaltante`) YA los
 * calcula/persiste el backend — acá solo se comparan por igualdad/mayor-que
 * para habilitar el trigger, nunca se agrega un `.every()`/`.some()` sobre
 * ítems. Si el front se equivoca al habilitar un botón, el backend igual
 * responde 422 y el mensaje real llega vía `notifyError` — el gate es UX, no
 * la autoridad.
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
  useRegistrarOrdenDeItem,
  useRegistrarRecepcionDeItem,
  useRegistrarEntregaDeItem,
} from "../hooks/use-compra-mutations";
import {
  registrarOrdenDeItemSchema,
  registrarRecepcionDeItemSchema,
  registrarEntregaDeItemSchema,
  type RegistrarOrdenDeItemFormValues,
  type RegistrarRecepcionDeItemFormValues,
  type RegistrarEntregaDeItemFormValues,
} from "../schemas";
import { aFechaInput, hoyISO } from "../lib/fecha";
import type { ItemCompra } from "../types";

export interface RegistrarAvanceDialogProps {
  compraId: string;
  item: ItemCompra;
}

/** "YYYY-MM-DD" desde un ISO string del backend, o `hoyISO()` si es null (prellenado, R4/S51). */
function fechaODefault(fechaISO: string | null): string {
  return fechaISO ? aFechaInput(fechaISO) : hoyISO();
}

/** S47: solo un ítem APROBADO puede registrar orden; TERMINAL si ya cerró con faltante (S48). */
export function RegistrarOrdenDialog({ compraId, item }: RegistrarAvanceDialogProps) {
  const [open, setOpen] = useState(false);
  const registrarMutation = useRegistrarOrdenDeItem(compraId);
  const puedeRegistrar = item.estadoAprobacion === "APROBADO" && !item.cerradoConFaltante;
  // Default: si ya hay algo ordenado, precarga ese acumulado; si no, el TECHO
  // (cantidad pedida) — no una resta, ver JSDoc del archivo.
  const defaultCantidad = item.cantidadOrdenada > 0 ? item.cantidadOrdenada : item.cantidad;
  const defaultFecha = fechaODefault(item.fechaOrden);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<RegistrarOrdenDeItemFormValues>({
    resolver: zodResolver(registrarOrdenDeItemSchema),
    defaultValues: { cantidadOrdenada: defaultCantidad, fecha: defaultFecha },
  });

  /**
   * Guardar sin tocar NI la cantidad NI la fecha es un no-op que el dominio
   * acepta (idempotente), pero igual escribiría una `OperacionCompra` que no
   * refleja ningún cambio real. El gate va acá, en el origen del ruido.
   */
  const sinCambio =
    Number(watch("cantidadOrdenada")) === item.cantidadOrdenada && watch("fecha") === defaultFecha;

  function submit(values: RegistrarOrdenDeItemFormValues) {
    registrarMutation.mutate(
      { itemId: item.id, dto: { cantidadOrdenada: values.cantidadOrdenada, fecha: values.fecha } },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset({ cantidadOrdenada: defaultCantidad, fecha: defaultFecha });
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          disabled={!puedeRegistrar}
          title={puedeRegistrar ? undefined : "El ítem debe estar aprobado y no cerrado con faltante"}
        >
          Registrar orden
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar orden — {item.descripcion}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          <p className="text-xs text-muted-foreground">
            Cantidad ACUMULADA ordenada hasta ahora (no un incremento) — solicitado: {item.cantidad}.
          </p>
          <div className="flex flex-col gap-1">
            <label htmlFor="registrar-orden-cantidad" className="text-sm font-medium text-foreground">
              Cantidad ordenada
            </label>
            <Input
              id="registrar-orden-cantidad"
              type="number"
              step="0.01"
              min="0"
              error={!!errors.cantidadOrdenada}
              {...register("cantidadOrdenada")}
            />
            {errors.cantidadOrdenada && (
              <p role="alert" className="text-sm text-destructive">
                {errors.cantidadOrdenada.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="registrar-orden-fecha" className="text-sm font-medium text-foreground">
              Fecha
            </label>
            <Input id="registrar-orden-fecha" type="date" {...register("fecha")} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="submit"
              isLoading={registrarMutation.isPending}
              disabled={sinCambio}
              title={sinCambio ? "No cambiaste la cantidad ni la fecha" : undefined}
            >
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Requiere `cantidadOrdenada > 0` (si no, cualquier recepción excede lo ordenado, S43). */
export function RegistrarRecepcionDialog({ compraId, item }: RegistrarAvanceDialogProps) {
  const [open, setOpen] = useState(false);
  const registrarMutation = useRegistrarRecepcionDeItem(compraId);
  const puedeRegistrar = item.cantidadOrdenada > 0 && !item.cerradoConFaltante;
  const defaultCantidad = item.cantidadRecibida > 0 ? item.cantidadRecibida : item.cantidadOrdenada;
  const defaultFecha = fechaODefault(item.fechaRecepcion);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<RegistrarRecepcionDeItemFormValues>({
    resolver: zodResolver(registrarRecepcionDeItemSchema),
    defaultValues: { cantidadRecibida: defaultCantidad, fecha: defaultFecha },
  });

  const sinCambio =
    Number(watch("cantidadRecibida")) === item.cantidadRecibida && watch("fecha") === defaultFecha;

  function submit(values: RegistrarRecepcionDeItemFormValues) {
    registrarMutation.mutate(
      { itemId: item.id, dto: { cantidadRecibida: values.cantidadRecibida, fecha: values.fecha } },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset({ cantidadRecibida: defaultCantidad, fecha: defaultFecha });
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          disabled={!puedeRegistrar}
          title={puedeRegistrar ? undefined : "Todavía no hay nada ordenado que recibir"}
        >
          Registrar recepción
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar recepción — {item.descripcion}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          <p className="text-xs text-muted-foreground">
            Cantidad ACUMULADA recibida hasta ahora (no un incremento) — ordenado: {item.cantidadOrdenada}.
          </p>
          <div className="flex flex-col gap-1">
            <label htmlFor="registrar-recepcion-cantidad" className="text-sm font-medium text-foreground">
              Cantidad recibida
            </label>
            <Input
              id="registrar-recepcion-cantidad"
              type="number"
              step="0.01"
              min="0"
              error={!!errors.cantidadRecibida}
              {...register("cantidadRecibida")}
            />
            {errors.cantidadRecibida && (
              <p role="alert" className="text-sm text-destructive">
                {errors.cantidadRecibida.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="registrar-recepcion-fecha" className="text-sm font-medium text-foreground">
              Fecha
            </label>
            <Input id="registrar-recepcion-fecha" type="date" {...register("fecha")} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="submit"
              isLoading={registrarMutation.isPending}
              disabled={sinCambio}
              title={sinCambio ? "No cambiaste la cantidad ni la fecha" : undefined}
            >
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Requiere `cantidadRecibida > 0` (si no, cualquier entrega excede lo recibido, S44). */
export function RegistrarEntregaDialog({ compraId, item }: RegistrarAvanceDialogProps) {
  const [open, setOpen] = useState(false);
  const registrarMutation = useRegistrarEntregaDeItem(compraId);
  const puedeRegistrar = item.cantidadRecibida > 0 && !item.cerradoConFaltante;
  const defaultCantidad = item.cantidadEntregada > 0 ? item.cantidadEntregada : item.cantidadRecibida;
  const defaultFecha = fechaODefault(item.fechaEntrega);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<RegistrarEntregaDeItemFormValues>({
    resolver: zodResolver(registrarEntregaDeItemSchema),
    defaultValues: { cantidadEntregada: defaultCantidad, fecha: defaultFecha },
  });

  const sinCambio =
    Number(watch("cantidadEntregada")) === item.cantidadEntregada && watch("fecha") === defaultFecha;

  function submit(values: RegistrarEntregaDeItemFormValues) {
    registrarMutation.mutate(
      { itemId: item.id, dto: { cantidadEntregada: values.cantidadEntregada, fecha: values.fecha } },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset({ cantidadEntregada: defaultCantidad, fecha: defaultFecha });
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          disabled={!puedeRegistrar}
          title={puedeRegistrar ? undefined : "Todavía no hay nada recibido que entregar"}
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
            Cantidad ACUMULADA entregada hasta ahora (no un incremento) — recibido: {item.cantidadRecibida}.
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
          <div className="flex flex-col gap-1">
            <label htmlFor="registrar-entrega-fecha" className="text-sm font-medium text-foreground">
              Fecha
            </label>
            <Input id="registrar-entrega-fecha" type="date" {...register("fecha")} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="submit"
              isLoading={registrarMutation.isPending}
              disabled={sinCambio}
              title={sinCambio ? "No cambiaste la cantidad ni la fecha" : undefined}
            >
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
