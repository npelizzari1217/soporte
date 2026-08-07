"use client";

/**
 * ReparacionCreateDialog — crear un ticket edilicio (T5.8). Sin ruta
 * dedicada (ADR-1: solo `/edilicia`) — alta inline, mismo patrón que
 * `CompraCreateDialog` (B5).
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
import { useUbicaciones } from "../hooks/use-ubicaciones";
import { useCrearReparacion } from "../hooks/use-reparacion-mutations";
import { crearReparacionSchema, type CrearReparacionFormValues } from "../schemas";
import { UbicacionSelect } from "./ubicacion-select";

export function ReparacionCreateDialog() {
  const [open, setOpen] = useState(false);
  const prioridadesQuery = usePrioridades();
  const ubicacionesQuery = useUbicaciones();
  const crearMutation = useCrearReparacion();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CrearReparacionFormValues>({ resolver: zodResolver(crearReparacionSchema) });

  function submit(values: CrearReparacionFormValues) {
    crearMutation.mutate(
      {
        titulo: values.titulo,
        descripcion: values.descripcion || undefined,
        prioridadId: values.prioridadId,
        ubicacionId: values.ubicacionId,
      },
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
      <DialogTrigger asChild>
        <Button>Nueva reparación</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva reparación</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="reparacion-titulo" className="text-sm font-medium text-foreground">
              Título
            </label>
            <Input id="reparacion-titulo" error={!!errors.titulo} {...register("titulo")} />
            {errors.titulo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.titulo.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="reparacion-descripcion" className="text-sm font-medium text-foreground">
              Descripción
            </label>
            <Textarea id="reparacion-descripcion" {...register("descripcion")} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="reparacion-ubicacion" className="text-sm font-medium text-foreground">
              Ubicación
            </label>
            <UbicacionSelect
              id="reparacion-ubicacion"
              ubicaciones={ubicacionesQuery.data ?? []}
              error={!!errors.ubicacionId}
              {...register("ubicacionId")}
            />
            {errors.ubicacionId && (
              <p role="alert" className="text-sm text-destructive">
                {errors.ubicacionId.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="reparacion-prioridad" className="text-sm font-medium text-foreground">
              Prioridad
            </label>
            <Select
              id="reparacion-prioridad"
              error={!!errors.prioridadId}
              defaultValue=""
              {...register("prioridadId")}
            >
              <option value="" disabled>
                Elegí una prioridad
              </option>
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

          <div className="flex justify-end gap-2">
            <Button type="submit" isLoading={crearMutation.isPending}>
              Crear
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
