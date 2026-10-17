"use client";

/**
 * ReparacionEditDialog — editar una reparación que todavía no se empezó a trabajar
 * (odd/detalle-ticket-legible, S6): título, descripción, ubicación propia de Edilicia, prioridad y
 * sector. Mismo formulario que el alta, precargado con la fila del listado.
 *
 * El botón se deshabilita con el motivo visible cuando la regla de `puedeEditarReparacionUi` no se
 * cumple; el backend sigue siendo la autoridad y su 422 llega como toast. Los catálogos de prioridades
 * y sectores se piden recién al abrir. El formulario se resincroniza al abrir (`reset` con los valores
 * vigentes): el diálogo vive en la fila y no se desmonta al cerrarse.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { usePrioridades } from "@/features/tickets/hooks/use-catalogos";
import { useSectores } from "@/features/sectores/hooks/use-sectores";
import { useEditarReparacion } from "../hooks/use-reparacion-mutations";
import { editarReparacionSchema, type EditarReparacionFormValues } from "../schemas";
import {
  MENSAJES_NO_EDITABLE,
  puedeEditarReparacionUi,
  type ReparacionParaEditar,
} from "../lib/permisos-reparacion";

export interface ReparacionEditDialogProps {
  reparacion: ReparacionParaEditar & {
    id: string;
    numero: string;
    titulo: string;
    descripcion: string | null;
    prioridadId: string;
    ubicacion: string | null;
    sectorId: string | null;
  };
  /** Código del estado del ticket; `undefined` mientras el catálogo no resolvió. */
  estadoCodigo: string | undefined;
  esRoot: boolean;
}

export function ReparacionEditDialog({ reparacion, estadoCodigo, esRoot }: ReparacionEditDialogProps) {
  const [open, setOpen] = useState(false);
  const prioridadesQuery = usePrioridades();
  const sectoresQuery = useSectores(open);
  const editarMutation = useEditarReparacion(reparacion.id);
  const regla = puedeEditarReparacionUi(reparacion, estadoCodigo, esRoot);

  const valoresVigentes: EditarReparacionFormValues = {
    titulo: reparacion.titulo,
    descripcion: reparacion.descripcion ?? "",
    prioridadId: reparacion.prioridadId,
    ubicacion: reparacion.ubicacion ?? "",
    sectorId: reparacion.sectorId ?? "",
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditarReparacionFormValues>({
    resolver: zodResolver(editarReparacionSchema),
    defaultValues: valoresVigentes,
  });

  function submit(values: EditarReparacionFormValues) {
    editarMutation.mutate(
      {
        titulo: values.titulo,
        descripcion: values.descripcion || null,
        prioridadId: values.prioridadId,
        ubicacion: values.ubicacion || null,
        sectorId: values.sectorId || null,
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  const idBase = `editar-reparacion-${reparacion.id}`;

  return (
    <div className="flex flex-col gap-1">
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) reset(valoresVigentes);
        }}
      >
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={!regla.puede}
            aria-label={`Editar ${reparacion.numero}`}
            aria-describedby={regla.puede ? undefined : `${idBase}-motivo`}
          >
            Editar
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar reparación {reparacion.numero}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${idBase}-titulo`} className="text-sm font-medium text-foreground">
                Título
              </label>
              <Input id={`${idBase}-titulo`} error={!!errors.titulo} {...register("titulo")} />
              {errors.titulo && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.titulo.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={`${idBase}-descripcion`} className="text-sm font-medium text-foreground">
                Descripción
              </label>
              <Textarea id={`${idBase}-descripcion`} {...register("descripcion")} />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={`${idBase}-ubicacion`} className="text-sm font-medium text-foreground">
                Ubicación
              </label>
              <Input id={`${idBase}-ubicacion`} error={!!errors.ubicacion} {...register("ubicacion")} />
              {errors.ubicacion && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.ubicacion.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={`${idBase}-prioridad`} className="text-sm font-medium text-foreground">
                Prioridad
              </label>
              <Select id={`${idBase}-prioridad`} error={!!errors.prioridadId} {...register("prioridadId")}>
                {(prioridadesQuery.data ?? []).map((prioridad) => (
                  <option key={prioridad.id} value={prioridad.id}>
                    {prioridad.nombre}
                  </option>
                ))}
              </Select>
              {errors.prioridadId && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.prioridadId.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={`${idBase}-sector`} className="text-sm font-medium text-foreground">
                Sector
              </label>
              <Select id={`${idBase}-sector`} {...register("sectorId")}>
                <option value="">Sin sector</option>
                {(sectoresQuery.data ?? []).map((sector) => (
                  <option key={sector.id} value={sector.id}>
                    {sector.nombre}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="submit" isLoading={editarMutation.isPending}>
                Guardar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {!regla.puede && (
        <p id={`${idBase}-motivo`} className="text-xs text-muted-foreground">
          {MENSAJES_NO_EDITABLE[regla.motivo]}
        </p>
      )}
    </div>
  );
}
