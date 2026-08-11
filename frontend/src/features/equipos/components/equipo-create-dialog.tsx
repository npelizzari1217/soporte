"use client";

/**
 * EquipoCreateDialog — alta de equipo en el inventario (T5.12). Sin ruta
 * dedicada de creación (ADR-1: `/equipos`, `/equipos/[id]`) — alta inline,
 * mismo patrón que `CompraCreateDialog`/`ReparacionCreateDialog` (B5).
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UbicacionSelect } from "@/features/edilicia/components/ubicacion-select";
import { useUbicaciones } from "@/features/edilicia/hooks/use-ubicaciones";
import { useCrearEquipo } from "../hooks/use-equipo-mutations";
import { crearEquipoSchema, type CrearEquipoFormValues } from "../schemas";

export function EquipoCreateDialog() {
  const [open, setOpen] = useState(false);
  const crearMutation = useCrearEquipo();
  const ubicacionesQuery = useUbicaciones();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CrearEquipoFormValues>({ resolver: zodResolver(crearEquipoSchema) });

  function submit(values: CrearEquipoFormValues) {
    crearMutation.mutate(
      {
        nombre: values.nombre,
        numeroSerie: values.numeroSerie || undefined,
        marca: values.marca || undefined,
        modelo: values.modelo || undefined,
        fechaAdquisicion: values.fechaAdquisicion || undefined,
        ubicacionId: values.ubicacionId || undefined,
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
        <Button>Nuevo equipo</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo equipo</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="equipo-nombre" className="text-sm font-medium text-foreground">
              Nombre
            </label>
            <Input id="equipo-nombre" error={!!errors.nombre} {...register("nombre")} />
            {errors.nombre && (
              <p role="alert" className="text-sm text-destructive">
                {errors.nombre.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="equipo-serie" className="text-sm font-medium text-foreground">
              Número de serie
            </label>
            <Input id="equipo-serie" {...register("numeroSerie")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="equipo-marca" className="text-sm font-medium text-foreground">
              Marca
            </label>
            <Input id="equipo-marca" {...register("marca")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="equipo-modelo" className="text-sm font-medium text-foreground">
              Modelo
            </label>
            <Input id="equipo-modelo" {...register("modelo")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="equipo-fecha" className="text-sm font-medium text-foreground">
              Fecha de adquisición
            </label>
            <Input id="equipo-fecha" type="date" {...register("fechaAdquisicion")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="equipo-ubicacion" className="text-sm font-medium text-foreground">
              Ubicación
            </label>
            <UbicacionSelect
              id="equipo-ubicacion"
              ubicaciones={ubicacionesQuery.data ?? []}
              emptyLabel="Sin ubicación"
              {...register("ubicacionId")}
            />
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
