"use client";

/**
 * EquipoEditDialog — modal de edición de un equipo. Conversión del form que
 * antes vivía inline en `EquipoDetailView` (fix/equipo-edit-modal): el resto de
 * las altas/ediciones de la app abren en popup y esta era la excepción. Recibe
 * el equipo YA cargado por el detalle (evita un segundo GET) y pre-pobla los
 * campos al abrir. Incluye la calculadora de depreciación COMPUESTA (el % no se
 * guarda; solo deriva el valor residual + su fecha sobre el residual previo, o
 * el importe si no hubo cálculo previo). Gate `equipo:gestionar` lo aplica el
 * caller (`EquipoDetailView`) vía `<Can>`.
 */
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MontoInput } from "@/components/shared/monto-input";
import { formatearNumeroEsAr } from "@/shared/lib/formato-numero";
import { aFechaInput, hoyFechaCalendario } from "@/shared/lib/formato-fecha";
import { useEditarEquipo } from "../hooks/use-equipo-mutations";
import { crearEquipoSchema, type CrearEquipoFormValues } from "../schemas";
import { baseDepreciacion, calcularValorResidual, parseImporte } from "../depreciacion";
import type { EquipoDetalle } from "../types";

export interface EquipoEditDialogProps {
  equipo: EquipoDetalle;
}

/**
 * Mapea el equipo cargado a los valores del form: ISO (`2026-08-11T00:00:00Z`)
 * → `YYYY-MM-DD` que espera `<input type="date">` vía `aFechaInput`
 * (`Equipo.fechaAdquisicion` / `fechaValoracion` / `fechaValorResidual` son
 * `@db.Date`; estos tres valores alimentan un input, nunca se muestran en
 * pantalla — deduplica el `.slice(0, 10)` open-coded, no cambia el
 * comportamiento, `aFechaInput` ya maneja `null`/`undefined`), y number/null
 * → string vacío.
 */
function equipoAFormValues(equipo: EquipoDetalle): CrearEquipoFormValues {
  return {
    nombre: equipo.nombre,
    numeroSerie: equipo.numeroSerie ?? "",
    marca: equipo.marca ?? "",
    modelo: equipo.modelo ?? "",
    fechaAdquisicion: aFechaInput(equipo.fechaAdquisicion),
    ubicacion: equipo.ubicacion ?? "",
    importe: equipo.importe != null ? String(equipo.importe) : "",
    fechaValoracion: aFechaInput(equipo.fechaValoracion),
    observaciones: equipo.observaciones ?? "",
    valorResidual: equipo.valorResidual != null ? String(equipo.valorResidual) : "",
    fechaValorResidual: aFechaInput(equipo.fechaValorResidual),
    porcentajeDepreciacion: "",
  };
}

export function EquipoEditDialog({ equipo }: EquipoEditDialogProps) {
  const [open, setOpen] = useState(false);
  const editarMutation = useEditarEquipo(equipo.id);

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

  function handleOpenChange(next: boolean) {
    // Pre-poblar con los valores actuales cada vez que se abre → form fresco.
    if (next) reset(equipoAFormValues(equipo));
    setOpen(next);
  }

  function submit(values: CrearEquipoFormValues) {
    // PATCH con formulario pre-poblado: un campo que quedó vacío = el usuario lo
    // limpió → se manda `null` (el backend distingue null=limpiar de undefined=mantener).
    editarMutation.mutate(
      {
        nombre: values.nombre,
        numeroSerie: values.numeroSerie || null,
        marca: values.marca || null,
        modelo: values.modelo || null,
        fechaAdquisicion: values.fechaAdquisicion || null,
        ubicacion: values.ubicacion ? values.ubicacion.toUpperCase() : null,
        importe: parseImporte(values.importe),
        fechaValoracion: values.fechaValoracion || null,
        observaciones: values.observaciones || null,
        valorResidual: parseImporte(values.valorResidual),
        fechaValorResidual: values.fechaValorResidual || null,
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar equipo</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="editar-equipo-nombre" className="text-sm font-medium text-foreground">
              Nombre
            </label>
            <Input id="editar-equipo-nombre" error={!!errors.nombre} {...register("nombre")} />
            {errors.nombre && (
              <p role="alert" className="text-sm text-destructive">
                {errors.nombre.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="editar-equipo-serie" className="text-sm font-medium text-foreground">
              Número de serie
            </label>
            <Input id="editar-equipo-serie" {...register("numeroSerie")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="editar-equipo-marca" className="text-sm font-medium text-foreground">
              Marca
            </label>
            <Input id="editar-equipo-marca" {...register("marca")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="editar-equipo-modelo" className="text-sm font-medium text-foreground">
              Modelo
            </label>
            <Input id="editar-equipo-modelo" {...register("modelo")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="editar-equipo-fecha" className="text-sm font-medium text-foreground">
              Fecha de adquisición
            </label>
            <Input id="editar-equipo-fecha" type="date" {...register("fechaAdquisicion")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="editar-equipo-ubicacion" className="text-sm font-medium text-foreground">
              Ubicación
            </label>
            <Input
              id="editar-equipo-ubicacion"
              className="uppercase placeholder:normal-case"
              placeholder="Texto libre (se guarda en mayúscula)"
              {...register("ubicacion")}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="editar-equipo-importe" className="text-sm font-medium text-foreground">
              Importe (valor del equipo)
            </label>
            <Controller
              name="importe"
              control={control}
              render={({ field }) => (
                <MontoInput
                  id="editar-equipo-importe"
                  name={field.name}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="editar-equipo-fecha-valoracion" className="text-sm font-medium text-foreground">
              Fecha de valoración
            </label>
            <Input id="editar-equipo-fecha-valoracion" type="date" {...register("fechaValoracion")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="editar-equipo-observaciones" className="text-sm font-medium text-foreground">
              Observaciones
            </label>
            <Textarea id="editar-equipo-observaciones" rows={3} {...register("observaciones")} />
          </div>

          {/* Depreciación: el % NO se guarda; solo deriva el valor residual + su fecha. */}
          <div className="flex flex-col gap-3 rounded-md border border-border p-3">
            <p className="text-sm font-medium text-foreground">Depreciación</p>
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1">
                <label htmlFor="editar-equipo-porcentaje" className="text-sm font-medium text-foreground">
                  % de depreciación
                </label>
                <Input
                  id="editar-equipo-porcentaje"
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
              <label htmlFor="editar-equipo-valor-residual" className="text-sm font-medium text-foreground">
                Valor residual
              </label>
              <Controller
                name="valorResidual"
                control={control}
                render={({ field }) => (
                  <MontoInput
                    id="editar-equipo-valor-residual"
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="editar-equipo-fecha-residual" className="text-sm font-medium text-foreground">
                Fecha del valor residual
              </label>
              <Input id="editar-equipo-fecha-residual" type="date" {...register("fechaValorResidual")} />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" isLoading={editarMutation.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
