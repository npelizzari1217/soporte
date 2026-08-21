"use client";

/**
 * EquipoCreateDialog — alta de equipo en el inventario (T5.12). Sin ruta
 * dedicada de creación (ADR-1: `/equipos`, `/equipos/[id]`) — alta inline,
 * mismo patrón que `CompraCreateDialog`/`ReparacionCreateDialog` (B5).
 */
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MontoInput } from "@/components/shared/monto-input";
import { formatearNumeroEsAr } from "@/shared/lib/formato-numero";
import { useCrearEquipo } from "../hooks/use-equipo-mutations";
import { crearEquipoSchema, type CrearEquipoFormValues } from "../schemas";
import { hoyFechaCalendario } from "@/shared/lib/formato-fecha";
import { baseDepreciacion, calcularValorResidual, parseImporte } from "../depreciacion";

export function EquipoCreateDialog() {
  const [open, setOpen] = useState(false);
  const crearMutation = useCrearEquipo();

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<CrearEquipoFormValues>({ resolver: zodResolver(crearEquipoSchema) });

  const importeActual = watch("importe");
  const valorResidualActual = watch("valorResidual");
  const porcentajeActual = watch("porcentajeDepreciacion");
  // Depreciación COMPUESTA: la base es el valor residual actual (si ya hubo un
  // cálculo previo) o, si no, el importe original.
  const base = baseDepreciacion(parseImporte(importeActual), parseImporte(valorResidualActual));
  const baseEsResidual = parseImporte(valorResidualActual) !== null;
  const puedeAplicar = base !== null && !!(porcentajeActual && porcentajeActual.trim());

  /**
   * Aplica el % de depreciación sobre la base (valor residual actual o importe):
   * setea el nuevo valor residual (derivado) + fecha = hoy (editable).
   */
  function aplicarDepreciacion() {
    const baseActual = baseDepreciacion(
      parseImporte(getValues("importe")),
      parseImporte(getValues("valorResidual")),
    );
    const porcentaje = parseImporte(getValues("porcentajeDepreciacion"));
    if (baseActual === null || porcentaje === null) return;
    setValue("valorResidual", String(calcularValorResidual(baseActual, porcentaje)), {
      shouldValidate: true,
    });
    setValue("fechaValorResidual", hoyFechaCalendario(), { shouldValidate: true });
  }

  function submit(values: CrearEquipoFormValues) {
    crearMutation.mutate(
      {
        nombre: values.nombre,
        numeroSerie: values.numeroSerie || undefined,
        marca: values.marca || undefined,
        modelo: values.modelo || undefined,
        fechaAdquisicion: values.fechaAdquisicion || undefined,
        ubicacion: values.ubicacion ? values.ubicacion.toUpperCase() : undefined,
        importe: parseImporte(values.importe) ?? undefined,
        fechaValoracion: values.fechaValoracion || undefined,
        observaciones: values.observaciones || undefined,
        valorResidual: parseImporte(values.valorResidual) ?? undefined,
        fechaValorResidual: values.fechaValorResidual || undefined,
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
      {/* Mismo ancho que `EquipoEditDialog`: son el mismo formulario y quedaban
          de dos tamaños distintos según entraras por alta o por edición. */}
      <DialogContent className="sm:max-w-2xl">
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
            <Input
              id="equipo-ubicacion"
              className="uppercase placeholder:normal-case"
              placeholder="Texto libre (se guarda en mayúscula)"
              {...register("ubicacion")}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="equipo-importe" className="text-sm font-medium text-foreground">
              Importe (valor del equipo)
            </label>
            <Controller
              name="importe"
              control={control}
              render={({ field }) => (
                <MontoInput
                  id="equipo-importe"
                  name={field.name}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="equipo-fecha-valoracion" className="text-sm font-medium text-foreground">
              Fecha de valoración
            </label>
            <Input id="equipo-fecha-valoracion" type="date" {...register("fechaValoracion")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="equipo-observaciones" className="text-sm font-medium text-foreground">
              Observaciones
            </label>
            <Textarea id="equipo-observaciones" rows={3} {...register("observaciones")} />
          </div>

          {/* Depreciación: el % NO se guarda; solo deriva el valor residual + su fecha. */}
          <div className="flex flex-col gap-3 rounded-md border border-border p-3">
            <p className="text-sm font-medium text-foreground">Depreciación</p>
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1">
                <label htmlFor="equipo-porcentaje" className="text-sm font-medium text-foreground">
                  % de depreciación
                </label>
                <Input
                  id="equipo-porcentaje"
                  type="number"
                  step="0.01"
                  min="0"
                  max="999.99"
                  error={!!errors.porcentajeDepreciacion}
                  {...register("porcentajeDepreciacion")}
                />
              </div>
              <Button type="button" variant="outline" disabled={!puedeAplicar} onClick={aplicarDepreciacion}>
                Aplicar
              </Button>
            </div>
            {errors.porcentajeDepreciacion && (
              <p role="alert" className="text-sm text-destructive">
                {errors.porcentajeDepreciacion.message}
              </p>
            )}
            {base !== null && (
              <p className="text-xs text-muted-foreground">
                Se deprecia sobre {baseEsResidual ? "el valor residual actual" : "el importe"}: $
                {formatearNumeroEsAr(base)}
              </p>
            )}
            <div className="flex flex-col gap-1">
              <label htmlFor="equipo-valor-residual" className="text-sm font-medium text-foreground">
                Valor residual
              </label>
              <Controller
                name="valorResidual"
                control={control}
                render={({ field }) => (
                  <MontoInput
                    id="equipo-valor-residual"
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="equipo-fecha-residual" className="text-sm font-medium text-foreground">
                Fecha del valor residual
              </label>
              <Input id="equipo-fecha-residual" type="date" {...register("fechaValorResidual")} />
            </div>
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
