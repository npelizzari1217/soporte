"use client";

/**
 * PlanPreventivoCreateDialog — alta de plan de mantenimiento preventivo
 * (WU-7.2). Objetivo excluyente (ADR-PV1) resuelto con un radio "Equipo |
 * Ubicación": por defecto ninguno está elegido y AMBOS campos quedan
 * visibles y editables (permite reproducir en el form los dos rechazos del
 * dominio — "los dos" y "ninguno" — antes de que el usuario elija un lado);
 * al tocar un radio se limpia el campo del otro objetivo (UX), pero la
 * validación real (`schemas.ts`) es independiente del radio y mira
 * `equipoId`/`ubicacion` directo, igual que el dominio.
 *
 * Responsable: reusa `useUsuariosAsignables` (mismo `GET /usuarios` que
 * "Asignar ticket") — no hay endpoint propio de preventivo para listar
 * usuarios (fuera de alcance de este WU, "consumo, no API nueva"). Gate real:
 * `TICKETS:ASIGNAR`/`TICKETS:VER_TODOS`/ADMINISTRADOR en el backend — un
 * actor con SOLO `PREVENTIVO:ALTAS` puede no ver responsables (ver reporte).
 *
 * Las tres queries que alimentan selects (`equiposQuery`, `prioridadesQuery`,
 * `usuariosQuery`) exponen su `isError` con un mensaje inline (mismo criterio
 * que el resto de la feature con `DataTable`'s `error` prop): sin esto, un
 * fetch fallido o un 403 —el caso real del párrafo anterior— renderizaba un
 * dropdown vacío sin ninguna pista de por qué.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { useEquipos } from "@/features/equipos/hooks/use-equipos";
import { usePrioridades } from "@/features/tickets/hooks/use-catalogos";
import { useUsuariosAsignables } from "@/features/tickets/hooks/use-usuarios-asignables";
import { useCrearPlanPreventivo } from "../hooks/use-planes-preventivo-mutations";
import { crearPlanPreventivoSchema, type CrearPlanPreventivoFormValues } from "../schemas";

type Objetivo = "equipo" | "ubicacion" | null;

export function PlanPreventivoCreateDialog() {
  const [open, setOpen] = useState(false);
  const [objetivo, setObjetivo] = useState<Objetivo>(null);
  const equiposQuery = useEquipos();
  const prioridadesQuery = usePrioridades();
  const usuariosQuery = useUsuariosAsignables();
  const crearMutation = useCrearPlanPreventivo();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<CrearPlanPreventivoFormValues>({ resolver: zodResolver(crearPlanPreventivoSchema) });

  function elegirObjetivo(tipo: "equipo" | "ubicacion") {
    setObjetivo(tipo);
    if (tipo === "equipo") setValue("ubicacion", "", { shouldValidate: true });
    else setValue("equipoId", "", { shouldValidate: true });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      reset();
      setObjetivo(null);
    }
  }

  function submit(values: CrearPlanPreventivoFormValues) {
    crearMutation.mutate(
      {
        titulo: values.titulo,
        instrucciones: values.instrucciones || undefined,
        equipoId: values.equipoId || undefined,
        // Ya viene normalizada (trim + mayúscula) del schema, que normaliza ANTES
        // de medir el tope. Volver a normalizar acá reabriría el hueco que se
        // acaba de cerrar: lo validado y lo enviado tienen que ser el mismo string.
        ubicacion: values.ubicacion || undefined,
        prioridadId: values.prioridadId,
        responsableId: values.responsableId,
        intervaloValor: Number(values.intervaloValor),
        intervaloUnidad: values.intervaloUnidad,
        fechaInicio: values.fechaInicio,
      },
      { onSuccess: () => handleOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>Nuevo plan</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo plan de mantenimiento preventivo</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="plan-titulo" className="text-sm font-medium text-foreground">
              Título
            </label>
            <Input id="plan-titulo" error={!!errors.titulo} {...register("titulo")} />
            {errors.titulo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.titulo.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="plan-instrucciones" className="text-sm font-medium text-foreground">
              Instrucciones
            </label>
            <Textarea id="plan-instrucciones" rows={3} {...register("instrucciones")} />
          </div>

          <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium text-foreground">Objetivo</legend>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="plan-objetivo"
                  checked={objetivo === "equipo"}
                  onChange={() => elegirObjetivo("equipo")}
                />
                Equipo
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="plan-objetivo"
                  checked={objetivo === "ubicacion"}
                  onChange={() => elegirObjetivo("ubicacion")}
                />
                Ubicación
              </label>
            </div>

            {objetivo !== "ubicacion" && (
              <div className="flex flex-col gap-1">
                <label htmlFor="plan-equipo" className="text-sm font-medium text-foreground">
                  Equipo
                </label>
                <Select
                  id="plan-equipo"
                  error={!!errors.equipoId}
                  defaultValue=""
                  {...register("equipoId")}
                >
                  <option value="">Elegí un equipo</option>
                  {(equiposQuery.data ?? []).map((equipo) => (
                    <option key={equipo.id} value={equipo.id}>
                      {equipo.nombre}
                    </option>
                  ))}
                </Select>
                {equiposQuery.isError && (
                  <p role="alert" className="text-sm text-destructive">
                    No se pudieron cargar los equipos.
                  </p>
                )}
              </div>
            )}
            {objetivo !== "equipo" && (
              <div className="flex flex-col gap-1">
                <label htmlFor="plan-ubicacion" className="text-sm font-medium text-foreground">
                  Ubicación
                </label>
                <Input
                  id="plan-ubicacion"
                  className="uppercase placeholder:normal-case"
                  placeholder="Texto libre (se guarda en mayúscula)"
                  error={!!errors.ubicacion}
                  {...register("ubicacion")}
                />
              </div>
            )}
            {(errors.equipoId || errors.ubicacion) && (
              <p role="alert" className="text-sm text-destructive">
                {errors.equipoId?.message ?? errors.ubicacion?.message}
              </p>
            )}
          </fieldset>

          <div className="flex flex-col gap-1">
            <label htmlFor="plan-prioridad" className="text-sm font-medium text-foreground">
              Prioridad
            </label>
            <Select id="plan-prioridad" error={!!errors.prioridadId} defaultValue="" {...register("prioridadId")}>
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
            {prioridadesQuery.isError && (
              <p role="alert" className="text-sm text-destructive">
                No se pudieron cargar las prioridades.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="plan-responsable" className="text-sm font-medium text-foreground">
              Responsable
            </label>
            <Select id="plan-responsable" error={!!errors.responsableId} defaultValue="" {...register("responsableId")}>
              <option value="" disabled>
                Elegí un responsable
              </option>
              {(usuariosQuery.data ?? []).map((usuario) => (
                <option key={usuario.id} value={usuario.id}>
                  {usuario.nombre} {usuario.apellido}
                </option>
              ))}
            </Select>
            {errors.responsableId && (
              <p role="alert" className="text-sm text-destructive">
                {errors.responsableId.message}
              </p>
            )}
            {usuariosQuery.isError && (
              <p role="alert" className="text-sm text-destructive">
                No se pudo cargar la lista de responsables. Puede deberse a que no tenés
                permiso para ver usuarios (gate independiente de este formulario).
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="plan-cadencia" className="text-sm font-medium text-foreground">
                Cadencia
              </label>
              <Input
                id="plan-cadencia"
                type="number"
                min="1"
                step="1"
                error={!!errors.intervaloValor}
                {...register("intervaloValor")}
              />
              {errors.intervaloValor && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.intervaloValor.message}
                </p>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="plan-unidad" className="text-sm font-medium text-foreground">
                Unidad
              </label>
              <Select id="plan-unidad" defaultValue="MESES" {...register("intervaloUnidad")}>
                <option value="DIAS">Días</option>
                <option value="MESES">Meses</option>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="plan-fecha-inicio" className="text-sm font-medium text-foreground">
              Fecha de inicio
            </label>
            <Input
              id="plan-fecha-inicio"
              type="date"
              error={!!errors.fechaInicio}
              {...register("fechaInicio")}
            />
            {errors.fechaInicio && (
              <p role="alert" className="text-sm text-destructive">
                {errors.fechaInicio.message}
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
