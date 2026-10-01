"use client";

/**
 * UnidadMedidaFormDialog — crear/editar una `UnidadMedida` (ABM del
 * catálogo, Admin > Insumos). Mismo patrón que
 * `familia-insumo-form-dialog.tsx` / `features/sectores/components/sector-form-dialog.tsx`.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ApiError } from "@/shared/api/types";
import { useCrearUnidadMedida, useEditarUnidadMedida } from "../hooks/use-unidad-medida-mutations";
import { unidadMedidaSchema, type UnidadMedidaFormValues } from "../schemas";
import type { UnidadMedida } from "../types";

export interface UnidadMedidaFormDialogProps {
  trigger: ReactNode;
  unidad?: UnidadMedida;
}

export function UnidadMedidaFormDialog({ trigger, unidad }: UnidadMedidaFormDialogProps) {
  const [open, setOpen] = useState(false);
  // Motivo del backend (p. ej. `UNIDAD_MEDIDA_EN_USO_POR_SERIE`): el diálogo queda abierto y lo muestra.
  const [errorBackend, setErrorBackend] = useState<string | null>(null);
  const isEdit = !!unidad;
  const crearMutation = useCrearUnidadMedida();
  const editarMutation = useEditarUnidadMedida(unidad?.id ?? "");
  const mutation = isEdit ? editarMutation : crearMutation;

  // Recalculado en CADA render: el reset de apertura inyecta el dato vigente
  // aunque el diálogo lleve montado desde el primer pintado de la tabla.
  const valoresVigentes: UnidadMedidaFormValues = unidad
    ? { codigo: unidad.codigo, nombre: unidad.nombre, entera: unidad.entera }
    : { codigo: "", nombre: "", entera: false };

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UnidadMedidaFormValues>({
    resolver: zodResolver(unidadMedidaSchema),
    defaultValues: valoresVigentes,
  });

  function submit(values: UnidadMedidaFormValues) {
    setErrorBackend(null);
    mutation.mutate(values, {
      onSuccess: () => {
        setOpen(false);
      },
      onError: (error) => {
        if (error instanceof ApiError) setErrorBackend(error.messages.join(" "));
      },
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setErrorBackend(null);
          reset(valoresVigentes);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar unidad de medida" : "Nueva unidad de medida"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="unidad-medida-codigo" className="text-sm font-medium text-foreground">
              Código
            </label>
            <Input id="unidad-medida-codigo" error={!!errors.codigo} {...register("codigo")} />
            {errors.codigo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.codigo.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="unidad-medida-nombre" className="text-sm font-medium text-foreground">
              Nombre
            </label>
            <Input id="unidad-medida-nombre" error={!!errors.nombre} {...register("nombre")} />
            {errors.nombre && (
              <p role="alert" className="text-sm text-destructive">
                {errors.nombre.message}
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={watch("entera")}
              onCheckedChange={(checked) => setValue("entera", checked === true)}
            />
            Entera (se cuenta en piezas, requerida para el seguimiento por serie)
          </label>

          {errorBackend && (
            <p role="alert" className="text-sm text-destructive">
              {errorBackend}
            </p>
          )}

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
