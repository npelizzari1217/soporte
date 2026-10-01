"use client";

/**
 * ComponenteEditDialog — edita un componente ACTIVO de un equipo (listado
 * enriquecido de componentes). Precarga descripción/número de serie/capacidad.
 *
 * El tipo y el repuesto son inmutables (sdd/catalogo-unico-componentes): el
 * tipo se deriva de la familia del repuesto y se muestra como texto de solo
 * lectura (`tipoNombre`, "—" si no se pudo resolver). El PATCH NO envía
 * `tipoComponenteCodigo` ni `insumoId`.
 * Con unidad (insumo `SERIE`) el serial queda deshabilitado y no se envía.
 * Solo aplica a componentes ACTIVOS — un componente dado de baja se edita
 * después de reactivarlo (`EditarComponenteUseCase` lo rechaza).
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditarComponente } from "../hooks/use-equipo-mutations";
import { editarComponenteSchema, type EditarComponenteFormValues } from "../schemas";
import type { ComponenteConTipo } from "../types";

export interface ComponenteEditDialogProps {
  equipoId: string;
  componente: ComponenteConTipo;
}

export function ComponenteEditDialog({ equipoId, componente }: ComponenteEditDialogProps) {
  const [open, setOpen] = useState(false);
  const editarMutation = useEditarComponente(equipoId);

  const conUnidad = !!componente.unidadId;
  const defaults: EditarComponenteFormValues = {
    descripcion: componente.descripcion ?? "",
    numeroSerie: componente.numeroSerie ?? "",
    capacidad: componente.capacidad ?? "",
  };

  const {
    register,
    handleSubmit,
    reset,
  } = useForm<EditarComponenteFormValues>({
    resolver: zodResolver(editarComponenteSchema),
    defaultValues: defaults,
  });

  function submit(values: EditarComponenteFormValues) {
    editarMutation.mutate(
      {
        componenteId: componente.id,
        dto: {
          descripcion: values.descripcion || null,
          // Con unidad el serial es de la unidad y se corrige desde el insumo: enviarlo da 422.
          ...(!conUnidad && { numeroSerie: values.numeroSerie || null }),
          capacidad: values.capacidad || null,
        },
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Resetear al ABRIR precarga los valores ACTUALES del componente en cada
        // apertura (defaultValues solo aplica en el primer mount del useForm; sin
        // esto, reabrir mostraría datos viejos si el componente cambió entretanto).
        if (next) reset(defaults);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" aria-label="Editar componente">
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar componente</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">Tipo</span>
            <p data-testid="editar-componente-tipo" className="text-sm text-foreground">
              {componente.tipoNombre ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              El tipo lo determina el repuesto del catálogo: no se puede cambiar editando este componente. Para que
              tenga otro tipo hay que reemplazarlo (darlo de baja y agregar uno nuevo).
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="editar-componente-descripcion" className="text-sm font-medium text-foreground">
              Descripción
            </label>
            <Input id="editar-componente-descripcion" {...register("descripcion")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="editar-componente-serie" className="text-sm font-medium text-foreground">
              Número de serie
            </label>
            <Input id="editar-componente-serie" disabled={conUnidad} {...register("numeroSerie")} />
            {conUnidad && (
              <p className="text-xs text-muted-foreground">
                El serial es el de la pieza: se corrige desde las unidades del insumo.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="editar-componente-capacidad" className="text-sm font-medium text-foreground">
              Capacidad
            </label>
            <Input id="editar-componente-capacidad" {...register("capacidad")} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" isLoading={editarMutation.isPending}>
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
