"use client";

/**
 * UbicacionFormDialog — crear/editar una `Ubicacion` (T5.7). Mismo patrón
 * que `TipoTicketFormDialog` (B4): modal genérico + RHF/zod. `padreId`
 * usa `UbicacionSelect` — permite anidar (o dejar en blanco = raíz).
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCrearUbicacion, useEditarUbicacion } from "../hooks/use-ubicacion-mutations";
import { crearUbicacionSchema, type CrearUbicacionFormValues } from "../schemas";
import { UbicacionSelect } from "./ubicacion-select";
import type { Ubicacion } from "../types";

export interface UbicacionFormDialogProps {
  trigger: ReactNode;
  ubicaciones: Ubicacion[];
  ubicacion?: Ubicacion;
}

export function UbicacionFormDialog({ trigger, ubicaciones, ubicacion }: UbicacionFormDialogProps) {
  const [open, setOpen] = useState(false);
  const isEdit = !!ubicacion;
  const crearMutation = useCrearUbicacion();
  const editarMutation = useEditarUbicacion(ubicacion?.id ?? "");
  const mutation = isEdit ? editarMutation : crearMutation;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CrearUbicacionFormValues>({
    resolver: zodResolver(crearUbicacionSchema),
    defaultValues: ubicacion
      ? { nombre: ubicacion.nombre, descripcion: ubicacion.descripcion ?? "", padreId: ubicacion.padreId ?? "" }
      : { nombre: "", descripcion: "", padreId: "" },
  });

  function submit(values: CrearUbicacionFormValues) {
    mutation.mutate(
      { nombre: values.nombre, descripcion: values.descripcion || undefined, padreId: values.padreId || undefined },
      {
        onSuccess: () => {
          setOpen(false);
          reset();
        },
      },
    );
  }

  const opcionesPadre = ubicaciones.filter((u) => u.id !== ubicacion?.id);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar ubicación" : "Nueva ubicación"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="ubicacion-nombre" className="text-sm font-medium text-foreground">
              Nombre
            </label>
            <Input id="ubicacion-nombre" error={!!errors.nombre} {...register("nombre")} />
            {errors.nombre && (
              <p role="alert" className="text-sm text-destructive">
                {errors.nombre.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="ubicacion-padre" className="text-sm font-medium text-foreground">
              Ubicación padre (opcional)
            </label>
            <UbicacionSelect
              id="ubicacion-padre"
              ubicaciones={opcionesPadre}
              emptyLabel="Sin padre (raíz)"
              {...register("padreId")}
            />
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
