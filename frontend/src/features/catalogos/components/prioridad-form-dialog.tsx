"use client";

/**
 * PrioridadFormDialog — crear/editar una `Prioridad` (T4.3). Mismo patrón
 * que `TipoTicketFormDialog`; agrega `color` (opcional) y `orden` (entero,
 * gobierna el orden de visualización).
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useCrearPrioridad, useEditarPrioridad } from "../hooks/use-catalogo-mutations";
import { prioridadSchema, type PrioridadFormValues } from "../schemas";
import type { Prioridad } from "@/features/tickets/types";

export interface PrioridadFormDialogProps {
  trigger: ReactNode;
  prioridad?: Prioridad;
}

export function PrioridadFormDialog({ trigger, prioridad }: PrioridadFormDialogProps) {
  const [open, setOpen] = useState(false);
  const isEdit = !!prioridad;
  const crearMutation = useCrearPrioridad();
  const editarMutation = useEditarPrioridad(prioridad?.id ?? "");
  const mutation = isEdit ? editarMutation : crearMutation;

  // Recalculado en CADA render: el reset de apertura inyecta el dato vigente
  // aunque el diálogo lleve montado desde el primer pintado de la tabla.
  const valoresVigentes: PrioridadFormValues = prioridad
    ? {
        codigo: prioridad.codigo,
        nombre: prioridad.nombre,
        color: prioridad.color ?? "",
        orden: prioridad.orden,
        slaHoras: prioridad.slaHoras !== null ? String(prioridad.slaHoras) : "",
        slaActivo: prioridad.slaActivo,
        slaPrimeraRespuestaHoras:
          prioridad.slaPrimeraRespuestaHoras !== null ? String(prioridad.slaPrimeraRespuestaHoras) : "",
      }
    : { codigo: "", nombre: "", color: "", orden: 0, slaHoras: "", slaActivo: true, slaPrimeraRespuestaHoras: "" };

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PrioridadFormValues>({
    resolver: zodResolver(prioridadSchema),
    defaultValues: valoresVigentes,
  });

  function submit(values: PrioridadFormValues) {
    mutation.mutate(
      {
        codigo: values.codigo,
        nombre: values.nombre,
        color: values.color || undefined,
        orden: values.orden,
        slaHoras: values.slaHoras ? Number(values.slaHoras) : null,
        slaActivo: values.slaActivo,
        slaPrimeraRespuestaHoras: values.slaPrimeraRespuestaHoras
          ? Number(values.slaPrimeraRespuestaHoras)
          : null,
      },
      {
        onSuccess: () => {
          setOpen(false);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset(valoresVigentes);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar prioridad" : "Nueva prioridad"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="prioridad-codigo" className="text-sm font-medium text-foreground">
              Código
            </label>
            <Input id="prioridad-codigo" error={!!errors.codigo} {...register("codigo")} />
            {errors.codigo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.codigo.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="prioridad-nombre" className="text-sm font-medium text-foreground">
              Nombre
            </label>
            <Input id="prioridad-nombre" error={!!errors.nombre} {...register("nombre")} />
            {errors.nombre && (
              <p role="alert" className="text-sm text-destructive">
                {errors.nombre.message}
              </p>
            )}
          </div>

          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="prioridad-color" className="text-sm font-medium text-foreground">
                Color (opcional)
              </label>
              <Input id="prioridad-color" placeholder="#f97316" {...register("color")} />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="prioridad-orden" className="text-sm font-medium text-foreground">
                Orden
              </label>
              <Input id="prioridad-orden" type="number" error={!!errors.orden} {...register("orden")} />
              {errors.orden && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.orden.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="prioridad-sla-horas" className="text-sm font-medium text-foreground">
                Horas de SLA (resolución objetivo)
              </label>
              <Input
                id="prioridad-sla-horas"
                type="number"
                min={1}
                placeholder="Sin SLA"
                error={!!errors.slaHoras}
                {...register("slaHoras")}
              />
              {errors.slaHoras && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.slaHoras.message}
                </p>
              )}
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
              <Checkbox
                checked={watch("slaActivo")}
                onCheckedChange={(checked) => setValue("slaActivo", checked === true)}
              />
              SLA activo
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="prioridad-sla-primera-respuesta" className="text-sm font-medium text-foreground">
              Primera respuesta (h)
            </label>
            <Input
              id="prioridad-sla-primera-respuesta"
              type="number"
              min={1}
              placeholder="Sin meta"
              error={!!errors.slaPrimeraRespuestaHoras}
              {...register("slaPrimeraRespuestaHoras")}
            />
            {errors.slaPrimeraRespuestaHoras && (
              <p role="alert" className="text-sm text-destructive">
                {errors.slaPrimeraRespuestaHoras.message}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="submit" isLoading={mutation.isPending}>
              {isEdit ? "Guardar" : "Crear"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
