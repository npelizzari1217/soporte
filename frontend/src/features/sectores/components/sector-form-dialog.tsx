"use client";

/**
 * SectorFormDialog — crear/editar un `Sector` (WU-31,
 * `compras-tres-etapas-y-sectores` R10). Mismo patrón que
 * `features/catalogos/components/tipo-ticket-form-dialog.tsx`.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCrearSector, useEditarSector } from "../hooks/use-sector-mutations";
import { sectorSchema, type SectorFormValues } from "../schemas";
import type { Sector } from "../types";

export interface SectorFormDialogProps {
  trigger: ReactNode;
  sector?: Sector;
}

export function SectorFormDialog({ trigger, sector }: SectorFormDialogProps) {
  const [open, setOpen] = useState(false);
  const isEdit = !!sector;
  const crearMutation = useCrearSector();
  const editarMutation = useEditarSector(sector?.id ?? "");
  const mutation = isEdit ? editarMutation : crearMutation;

  // Recalculado en CADA render: el reset de apertura inyecta el dato vigente
  // aunque el diálogo lleve montado desde el primer pintado de la tabla.
  const valoresVigentes: SectorFormValues = sector
    ? { codigo: sector.codigo, nombre: sector.nombre }
    : { codigo: "", nombre: "" };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SectorFormValues>({
    resolver: zodResolver(sectorSchema),
    defaultValues: valoresVigentes,
  });

  function submit(values: SectorFormValues) {
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
          <DialogTitle>{isEdit ? "Editar sector" : "Nuevo sector"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="sector-codigo" className="text-sm font-medium text-foreground">
              Código
            </label>
            <Input id="sector-codigo" error={!!errors.codigo} {...register("codigo")} />
            {errors.codigo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.codigo.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="sector-nombre" className="text-sm font-medium text-foreground">
              Nombre
            </label>
            <Input id="sector-nombre" error={!!errors.nombre} {...register("nombre")} />
            {errors.nombre && (
              <p role="alert" className="text-sm text-destructive">
                {errors.nombre.message}
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
