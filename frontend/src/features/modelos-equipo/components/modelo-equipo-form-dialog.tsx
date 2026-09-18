"use client";

/**
 * ModeloEquipoFormDialog — crear/editar un `ModeloEquipo` (ABM del catálogo,
 * Admin > Modelos de equipo). Molde exacto de
 * `features/insumos/components/unidad-medida-form-dialog.tsx` (ADR-1), con
 * dos desvíos: sin campo `codigo` (la identidad es el PAR `marca`+`modelo`) y
 * `submit()` normaliza antes de enviar en vez de confiar solo en el `.refine()`
 * del schema.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCrearModeloEquipo, useEditarModeloEquipo } from "../hooks/use-modelo-equipo-mutations";
import { modeloEquipoSchema, normalizarMarca, normalizarModelo, type ModeloEquipoFormValues } from "../schemas";
import type { ModeloEquipo } from "../types";

export interface ModeloEquipoFormDialogProps {
  trigger: ReactNode;
  modelo?: ModeloEquipo;
}

export function ModeloEquipoFormDialog({ trigger, modelo }: ModeloEquipoFormDialogProps) {
  const [open, setOpen] = useState(false);
  const isEdit = !!modelo;
  const crearMutation = useCrearModeloEquipo();
  const editarMutation = useEditarModeloEquipo(modelo?.id ?? "");
  const mutation = isEdit ? editarMutation : crearMutation;

  // Recalculado en CADA render: el reset de apertura inyecta el dato vigente
  // aunque el diálogo lleve montado desde el primer pintado de la tabla.
  const valoresVigentes: ModeloEquipoFormValues = modelo
    ? { marca: modelo.marca, modelo: modelo.modelo }
    : { marca: "", modelo: "" };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ModeloEquipoFormValues>({
    resolver: zodResolver(modeloEquipoSchema),
    defaultValues: valoresVigentes,
  });

  function submit(values: ModeloEquipoFormValues) {
    // Normaliza acá, no solo en el `.refine()` del schema: el backend guarda
    // `marca` en mayúscula y `modelo` con `trim()`, y el PATCH/POST tiene que
    // viajar con el mismo valor que el schema validó (mismo criterio que
    // `normalizarUbicacion` en `equipo-create-dialog.tsx`).
    mutation.mutate(
      { marca: normalizarMarca(values.marca), modelo: normalizarModelo(values.modelo) },
      {
        onSuccess: () => {
          setOpen(false);
        },
        // Sin onError acá: el 422 de par duplicado (R3) ya lo muestra
        // `notifyError` dentro del hook de mutación. Al no cerrar el diálogo
        // en ese camino (solo `onSuccess` cierra), el formulario queda abierto
        // con el mensaje visible, tal como pide la spec.
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
          <DialogTitle>{isEdit ? "Editar modelo de equipo" : "Nuevo modelo de equipo"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="modelo-equipo-marca" className="text-sm font-medium text-foreground">
              Marca
            </label>
            <Input id="modelo-equipo-marca" error={!!errors.marca} {...register("marca")} />
            {errors.marca && (
              <p role="alert" className="text-sm text-destructive">
                {errors.marca.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="modelo-equipo-modelo" className="text-sm font-medium text-foreground">
              Modelo
            </label>
            <Input id="modelo-equipo-modelo" error={!!errors.modelo} {...register("modelo")} />
            {errors.modelo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.modelo.message}
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
