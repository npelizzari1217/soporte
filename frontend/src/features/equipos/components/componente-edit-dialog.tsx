"use client";

/**
 * ComponenteEditDialog — edita un componente ACTIVO de un equipo (listado
 * enriquecido de componentes). Precarga tipo/descripción/número de
 * serie/capacidad. El selector de tipo lista los tipos ACTIVOS del catálogo
 * MASTER (`useTiposComponente`) + el tipo actual del componente si está
 * inactivo — para no forzar un cambio de tipo al editar solo otro campo
 * (mismo criterio que el badge "Dado de baja" de `EquipoComponentesSection`,
 * que resuelve el nombre de tipos ya no vigentes desde el dato embebido).
 * Solo aplica a componentes ACTIVOS — un componente dado de baja se edita
 * después de reactivarlo (`EditarComponenteUseCase` lo rechaza).
 *
 * Con `componente.insumoId != null` (VINCULADO a un repuesto del catálogo,
 * WU-3), el select de "Tipo" se DESHABILITA: el backend deriva ese campo de
 * la familia del repuesto y rechaza cualquier PATCH que intente cambiarlo
 * (`ComponenteVinculadoTipoInmutableError`, hallazgo de revisión automática).
 * Ofrecer un campo editable que el backend va a rechazar sería deshonesto —
 * mismo criterio que la rama `insumoIdElegido` de `ComponenteCreateDialog`.
 * El `submit()` de abajo sigue mandando este campo SIEMPRE (con el mismo
 * valor precargado): no cambiarlo no es lo mismo que omitirlo.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useTiposComponente } from "../hooks/use-equipos";
import { useEditarComponente } from "../hooks/use-equipo-mutations";
import { componenteSchema, type ComponenteFormValues } from "../schemas";
import type { ComponenteConTipo } from "../types";

export interface ComponenteEditDialogProps {
  equipoId: string;
  componente: ComponenteConTipo;
}

export function ComponenteEditDialog({ equipoId, componente }: ComponenteEditDialogProps) {
  const [open, setOpen] = useState(false);
  const tiposComponenteQuery = useTiposComponente();
  const editarMutation = useEditarComponente(equipoId);

  const defaults: ComponenteFormValues = {
    tipoComponenteCodigo: componente.tipoComponenteCodigo,
    descripcion: componente.descripcion ?? "",
    numeroSerie: componente.numeroSerie ?? "",
    capacidad: componente.capacidad ?? "",
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ComponenteFormValues>({
    resolver: zodResolver(componenteSchema),
    defaultValues: defaults,
  });

  const tiposActivos = tiposComponenteQuery.data ?? [];
  const tipoActualFueraDeCatalogo =
    !componente.tipoActivo && !tiposActivos.some((tipo) => tipo.codigo === componente.tipoComponenteCodigo);
  const opcionesTipo = tipoActualFueraDeCatalogo
    ? [
        ...tiposActivos,
        { codigo: componente.tipoComponenteCodigo, nombre: componente.tipoNombre ?? componente.tipoComponenteCodigo },
      ]
    : tiposActivos;

  function submit(values: ComponenteFormValues) {
    editarMutation.mutate(
      {
        componenteId: componente.id,
        dto: {
          tipoComponenteCodigo: values.tipoComponenteCodigo,
          descripcion: values.descripcion || null,
          numeroSerie: values.numeroSerie || null,
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
            <label htmlFor="editar-componente-tipo" className="text-sm font-medium text-foreground">
              Tipo
            </label>
            <Select
              id="editar-componente-tipo"
              disabled={componente.insumoId != null}
              error={!!errors.tipoComponenteCodigo}
              {...register("tipoComponenteCodigo")}
            >
              {opcionesTipo.map((tipo) => (
                <option key={tipo.codigo} value={tipo.codigo}>
                  {tipo.nombre}
                </option>
              ))}
            </Select>
            {componente.insumoId != null && (
              <p className="text-xs text-muted-foreground">
                El tipo lo determina el repuesto vinculado del catálogo: no se puede cambiar editando este
                componente. Para que tenga otro tipo hay que reemplazarlo (eliminarlo y agregar uno nuevo).
              </p>
            )}
            {errors.tipoComponenteCodigo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.tipoComponenteCodigo.message}
              </p>
            )}
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
            <Input id="editar-componente-serie" {...register("numeroSerie")} />
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
