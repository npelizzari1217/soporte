"use client";

/**
 * FeriadoGlobalFormDialog — crear/editar un feriado del calendario GLOBAL
 * (`/feriados`, master, ROOT-only, sdd/feriados-configurables). Mismo patrón
 * que `CicloVigenteFormDialog`: modal genérico + RHF/zod, un solo componente
 * para crear y editar. `feriadoSchema` valida el FORMATO de `fecha` y el
 * largo de `descripcion`; fecha real y duplicados los valida el backend,
 * mapeados a 422 y mostrados vía `notifyError` (`onError` del hook).
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCrearFeriado, useEditarFeriado } from "../hooks/use-feriados-globales-admin-mutations";
import { feriadoSchema, type FeriadoFormValues } from "../schemas";
import type { Feriado } from "../types";

export interface FeriadoGlobalFormDialogProps {
  trigger: ReactNode;
  feriado?: Feriado;
}

export function FeriadoGlobalFormDialog({ trigger, feriado }: FeriadoGlobalFormDialogProps) {
  const [open, setOpen] = useState(false);
  const isEdit = !!feriado;
  const crearMutation = useCrearFeriado();
  const editarMutation = useEditarFeriado(feriado?.id ?? "");
  const mutation = isEdit ? editarMutation : crearMutation;

  // Recalculado en CADA render, mismo criterio que `CicloVigenteFormDialog`:
  // el reset de apertura inyecta el dato vigente aunque el diálogo lleve
  // montado desde el primer pintado de la tabla.
  const valoresVigentes: FeriadoFormValues = feriado
    ? { fecha: feriado.fecha, descripcion: feriado.descripcion }
    : { fecha: "", descripcion: "" };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FeriadoFormValues>({
    resolver: zodResolver(feriadoSchema),
    defaultValues: valoresVigentes,
  });

  function submit(values: FeriadoFormValues) {
    mutation.mutate(
      { fecha: values.fecha, descripcion: values.descripcion },
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
          <DialogTitle>{isEdit ? "Editar feriado" : "Nuevo feriado"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="feriado-fecha" className="text-sm font-medium text-foreground">
              Fecha
            </label>
            <Input id="feriado-fecha" type="date" error={!!errors.fecha} {...register("fecha")} />
            {errors.fecha && (
              <p role="alert" className="text-sm text-destructive">
                {errors.fecha.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="feriado-descripcion" className="text-sm font-medium text-foreground">
              Descripción
            </label>
            <Input id="feriado-descripcion" error={!!errors.descripcion} {...register("descripcion")} />
            {errors.descripcion && (
              <p role="alert" className="text-sm text-destructive">
                {errors.descripcion.message}
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
