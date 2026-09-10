"use client";

/**
 * FamiliaInsumoFormDialog — crear/editar una `FamiliaInsumo` (ABM del
 * catálogo, Admin > Insumos). Mismo patrón que
 * `features/sectores/components/sector-form-dialog.tsx`.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useCrearFamiliaInsumo, useEditarFamiliaInsumo } from "../hooks/use-familia-insumo-mutations";
import { familiaInsumoSchema, type FamiliaInsumoFormValues } from "../schemas";
import type { FamiliaInsumo } from "../types";

export interface FamiliaInsumoFormDialogProps {
  trigger: ReactNode;
  familia?: FamiliaInsumo;
}

export function FamiliaInsumoFormDialog({ trigger, familia }: FamiliaInsumoFormDialogProps) {
  const [open, setOpen] = useState(false);
  const isEdit = !!familia;
  const crearMutation = useCrearFamiliaInsumo();
  const editarMutation = useEditarFamiliaInsumo(familia?.id ?? "");
  const mutation = isEdit ? editarMutation : crearMutation;

  // Recalculado en CADA render: el reset de apertura inyecta el dato vigente
  // aunque el diálogo lleve montado desde el primer pintado de la tabla.
  const valoresVigentes: FamiliaInsumoFormValues = familia
    ? { codigo: familia.codigo, nombre: familia.nombre, esRepuesto: familia.esRepuesto }
    : { codigo: "", nombre: "", esRepuesto: false };

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FamiliaInsumoFormValues>({
    resolver: zodResolver(familiaInsumoSchema),
    defaultValues: valoresVigentes,
  });

  function submit(values: FamiliaInsumoFormValues) {
    mutation.mutate(values, {
      onSuccess: () => {
        setOpen(false);
      },
    });
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
          <DialogTitle>{isEdit ? "Editar familia de insumo" : "Nueva familia de insumo"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="familia-insumo-codigo" className="text-sm font-medium text-foreground">
              Código
            </label>
            <Input id="familia-insumo-codigo" error={!!errors.codigo} {...register("codigo")} />
            {errors.codigo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.codigo.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="familia-insumo-nombre" className="text-sm font-medium text-foreground">
              Nombre
            </label>
            <Input id="familia-insumo-nombre" error={!!errors.nombre} {...register("nombre")} />
            {errors.nombre && (
              <p role="alert" className="text-sm text-destructive">
                {errors.nombre.message}
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={watch("esRepuesto")}
              onCheckedChange={(checked) => setValue("esRepuesto", checked === true)}
            />
            Es repuesto
          </label>

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
