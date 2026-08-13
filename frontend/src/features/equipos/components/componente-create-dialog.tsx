"use client";

/**
 * ComponenteCreateDialog — alta de un componente de un equipo desde el
 * toolbar del detalle (mismos 4 campos que `ComponenteEditDialog`: tipo,
 * descripción, número de serie, capacidad). Reemplaza el formulario inline
 * incompleto de `EquipoComponentesSection` (que solo pedía tipo + capacidad
 * — bug que dejaba `descripcion`/`numeroSerie` afuera del payload de alta).
 *
 * Sin la rama `tipoActualFueraDeCatalogo` de `ComponenteEditDialog`: esa
 * rama existe para no forzar un cambio de tipo al EDITAR un componente cuyo
 * tipo quedó dado de baja en el catálogo. Un alta no tiene "tipo actual" —
 * siempre parte del catálogo de tipos ACTIVOS (`useTiposComponente`).
 *
 * `submit()` envía `values.campo || undefined` (no `null`): a diferencia de
 * `ComponenteEditDialog` (PATCH semántico, donde `null` borra el valor
 * explícitamente), el alta es un POST — un campo vacío simplemente se omite
 * del body en vez de mandarse como "borrar" un valor que nunca existió.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useTiposComponente } from "../hooks/use-equipos";
import { useAgregarComponente } from "../hooks/use-equipo-mutations";
import { componenteSchema, type ComponenteFormValues } from "../schemas";

export interface ComponenteCreateDialogProps {
  equipoId: string;
}

const EMPTY: ComponenteFormValues = {
  tipoComponenteCodigo: "",
  descripcion: "",
  numeroSerie: "",
  capacidad: "",
};

export function ComponenteCreateDialog({ equipoId }: ComponenteCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const tiposComponenteQuery = useTiposComponente();
  const agregarMutation = useAgregarComponente(equipoId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ComponenteFormValues>({
    resolver: zodResolver(componenteSchema),
    defaultValues: EMPTY,
  });

  const tiposActivos = tiposComponenteQuery.data ?? [];

  function submit(values: ComponenteFormValues) {
    agregarMutation.mutate(
      {
        tipoComponenteCodigo: values.tipoComponenteCodigo,
        descripcion: values.descripcion || undefined,
        numeroSerie: values.numeroSerie || undefined,
        capacidad: values.capacidad || undefined,
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reset al ABRIR (no al cerrar ni tras el éxito): así el formulario
        // arranca siempre vacío, incluso si un alta anterior quedó a medio
        // completar y se cerró el dialog sin guardar.
        if (next) reset(EMPTY);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          Agregar componente
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar componente</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="crear-componente-tipo" className="text-sm font-medium text-foreground">
              Tipo
            </label>
            <Select
              id="crear-componente-tipo"
              error={!!errors.tipoComponenteCodigo}
              {...register("tipoComponenteCodigo")}
            >
              <option value="" disabled>
                Elegí un tipo
              </option>
              {tiposActivos.map((tipo) => (
                <option key={tipo.codigo} value={tipo.codigo}>
                  {tipo.nombre}
                </option>
              ))}
            </Select>
            {errors.tipoComponenteCodigo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.tipoComponenteCodigo.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="crear-componente-descripcion" className="text-sm font-medium text-foreground">
              Descripción
            </label>
            <Input id="crear-componente-descripcion" {...register("descripcion")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="crear-componente-serie" className="text-sm font-medium text-foreground">
              Número de serie
            </label>
            <Input id="crear-componente-serie" {...register("numeroSerie")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="crear-componente-capacidad" className="text-sm font-medium text-foreground">
              Capacidad
            </label>
            <Input id="crear-componente-capacidad" {...register("capacidad")} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" isLoading={agregarMutation.isPending}>
              Agregar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
