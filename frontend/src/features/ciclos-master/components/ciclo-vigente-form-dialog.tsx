"use client";

/**
 * CicloVigenteFormDialog — crear/editar un `CicloVigenteAdmin` del catálogo
 * master (sdd/ciclos-abm-root). Mismo patrón que `UbicacionFormDialog`
 * (`features/edilicia`): modal genérico + RHF/zod.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCrearCicloVigente, useEditarCicloVigente } from "../hooks/use-ciclos-vigentes-admin-mutations";
import { cicloVigenteSchema, type CicloVigenteFormValues } from "../schemas";
import type { CicloVigenteAdmin } from "../types";

export interface CicloVigenteFormDialogProps {
  trigger: ReactNode;
  ciclo?: CicloVigenteAdmin;
}

export function CicloVigenteFormDialog({ trigger, ciclo }: CicloVigenteFormDialogProps) {
  const [open, setOpen] = useState(false);
  const isEdit = !!ciclo;
  const crearMutation = useCrearCicloVigente();
  const editarMutation = useEditarCicloVigente(ciclo?.id ?? "");
  const mutation = isEdit ? editarMutation : crearMutation;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CicloVigenteFormValues>({
    resolver: zodResolver(cicloVigenteSchema),
    defaultValues: ciclo
      ? { nombre: ciclo.nombre, fechaInicio: ciclo.fechaInicio, fechaFin: ciclo.fechaFin }
      : { nombre: "", fechaInicio: "", fechaFin: "" },
  });

  function submit(values: CicloVigenteFormValues) {
    mutation.mutate(
      { nombre: values.nombre, fechaInicio: values.fechaInicio, fechaFin: values.fechaFin },
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
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar ciclo" : "Nuevo ciclo"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="ciclo-nombre" className="text-sm font-medium text-foreground">
              Nombre
            </label>
            <Input id="ciclo-nombre" error={!!errors.nombre} {...register("nombre")} />
            {errors.nombre && (
              <p role="alert" className="text-sm text-destructive">
                {errors.nombre.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="ciclo-fecha-inicio" className="text-sm font-medium text-foreground">
              Fecha de inicio
            </label>
            <Input
              id="ciclo-fecha-inicio"
              type="date"
              error={!!errors.fechaInicio}
              {...register("fechaInicio")}
            />
            {errors.fechaInicio && (
              <p role="alert" className="text-sm text-destructive">
                {errors.fechaInicio.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="ciclo-fecha-fin" className="text-sm font-medium text-foreground">
              Fecha de fin
            </label>
            <Input id="ciclo-fecha-fin" type="date" error={!!errors.fechaFin} {...register("fechaFin")} />
            {errors.fechaFin && (
              <p role="alert" className="text-sm text-destructive">
                {errors.fechaFin.message}
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
