"use client";

/**
 * EquipoDetailView — CONTAINER montado por `/equipos/[id]` (T5.13). Editar
 * inline (form con valores por defecto) + baja lógica detrás de
 * `ConfirmDialog` + componentes. Gate `equipo:gestionar` (todas las
 * mutaciones), consistente con `EquiposController`. La asignación a
 * personas se eliminó del dominio Equipos — vive solo en `Ticket`.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DetailSkeleton } from "@/components/shared/skeletons";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Can } from "@/components/shared/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useEquipo } from "../hooks/use-equipos";
import { useEditarEquipo, useEliminarEquipo } from "../hooks/use-equipo-mutations";
import { crearEquipoSchema, type CrearEquipoFormValues } from "../schemas";
import { baseDepreciacion, calcularValorResidual, hoyISO, parseImporte } from "../depreciacion";
import { EquipoComponentesSection } from "./equipo-componentes-section";

export interface EquipoDetailViewProps {
  equipoId: string;
}

export function EquipoDetailView({ equipoId }: EquipoDetailViewProps) {
  const router = useRouter();
  const equipoQuery = useEquipo(equipoId);
  const editarMutation = useEditarEquipo(equipoId);
  const eliminarMutation = useEliminarEquipo();
  const [editando, setEditando] = useState(false);

  const {
    register,
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
    setValue("fechaValorResidual", hoyISO(), { shouldValidate: true });
  }

  if (equipoQuery.isLoading) return <DetailSkeleton />;
  if (equipoQuery.isError || !equipoQuery.data) {
    return (
      <ErrorState
        message="No se pudo cargar el equipo."
        onRetry={() => {
          equipoQuery.refetch().catch(() => {});
        }}
      />
    );
  }

  const equipo = equipoQuery.data;

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
      { onSuccess: () => setEditando(false) },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={equipo.nombre}
        description={equipo.numeroSerie ?? undefined}
        actions={
          <Can permiso="equipo:gestionar">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  reset({
                    nombre: equipo.nombre,
                    numeroSerie: equipo.numeroSerie ?? "",
                    marca: equipo.marca ?? "",
                    modelo: equipo.modelo ?? "",
                    // ISO ("2026-08-11T00:00:00.000Z") → "YYYY-MM-DD" que espera <input type="date">.
                    fechaAdquisicion: equipo.fechaAdquisicion ? equipo.fechaAdquisicion.slice(0, 10) : "",
                    ubicacion: equipo.ubicacion ?? "",
                    importe: equipo.importe != null ? String(equipo.importe) : "",
                    fechaValoracion: equipo.fechaValoracion ? equipo.fechaValoracion.slice(0, 10) : "",
                    observaciones: equipo.observaciones ?? "",
                    valorResidual: equipo.valorResidual != null ? String(equipo.valorResidual) : "",
                    fechaValorResidual: equipo.fechaValorResidual
                      ? equipo.fechaValorResidual.slice(0, 10)
                      : "",
                    porcentajeDepreciacion: "",
                  });
                  setEditando((v) => !v);
                }}
              >
                {editando ? "Cancelar edición" : "Editar"}
              </Button>
              <ConfirmDialog
                trigger={
                  <Button variant="destructive" size="sm">
                    Dar de baja
                  </Button>
                }
                title="Dar de baja equipo"
                description={`¿Confirmás dar de baja "${equipo.nombre}"?`}
                confirmLabel="Dar de baja"
                confirmVariant="destructive"
                isConfirming={eliminarMutation.isPending}
                onConfirm={() => eliminarMutation.mutate(equipo.id, { onSuccess: () => router.push("/equipos") })}
              />
            </div>
          </Can>
        }
      />

      {editando && (
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
            <Input id="editar-equipo-importe" type="number" step="0.01" min="0" {...register("importe")} />
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
                Se deprecia sobre {baseEsResidual ? "el valor residual actual" : "el importe"}: ${base}
              </p>
            )}
            <div className="flex flex-col gap-1">
              <label htmlFor="editar-equipo-valor-residual" className="text-sm font-medium text-foreground">
                Valor residual
              </label>
              <Input
                id="editar-equipo-valor-residual"
                type="number"
                step="0.01"
                min="0"
                {...register("valorResidual")}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="editar-equipo-fecha-residual" className="text-sm font-medium text-foreground">
                Fecha del valor residual
              </label>
              <Input id="editar-equipo-fecha-residual" type="date" {...register("fechaValorResidual")} />
            </div>
          </div>

          <Button type="submit" isLoading={editarMutation.isPending} className="self-start">
            Guardar
          </Button>
        </form>
      )}

      <EquipoComponentesSection equipoId={equipo.id} componentes={equipo.componentes} />
    </div>
  );
}
