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
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UbicacionSelect } from "@/features/edilicia/components/ubicacion-select";
import { useUbicaciones } from "@/features/edilicia/hooks/use-ubicaciones";
import { useEquipo } from "../hooks/use-equipos";
import { useEditarEquipo, useEliminarEquipo } from "../hooks/use-equipo-mutations";
import { crearEquipoSchema, type CrearEquipoFormValues } from "../schemas";
import { EquipoComponentesSection } from "./equipo-componentes-section";

export interface EquipoDetailViewProps {
  equipoId: string;
}

export function EquipoDetailView({ equipoId }: EquipoDetailViewProps) {
  const router = useRouter();
  const equipoQuery = useEquipo(equipoId);
  const editarMutation = useEditarEquipo(equipoId);
  const eliminarMutation = useEliminarEquipo();
  const ubicacionesQuery = useUbicaciones();
  const [editando, setEditando] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CrearEquipoFormValues>({ resolver: zodResolver(crearEquipoSchema) });

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
        ubicacionId: values.ubicacionId || null,
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
                    ubicacionId: equipo.ubicacionId ?? "",
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
            <UbicacionSelect
              id="editar-equipo-ubicacion"
              ubicaciones={ubicacionesQuery.data ?? []}
              emptyLabel="Sin ubicación"
              defaultValue={equipo.ubicacionId ?? ""}
              {...register("ubicacionId")}
            />
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
