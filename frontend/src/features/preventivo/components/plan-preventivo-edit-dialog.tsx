"use client";

/**
 * PlanPreventivoEditDialog — edición de un plan preventivo existente
 * (EP-R1..R7, WU-3). Mismo formulario que el alta para los campos
 * compartidos (objetivo XOR, prioridad, responsable, cadencia), MENOS
 * `fechaInicio` (nunca se edita, ni deshabilitada — EP-R1) y MÁS `activo`
 * (se cambia en el mismo envío, sin endpoint aparte).
 *
 * ADR-4: el diálogo NO se desmonta al cerrarse — `onOpenChange` sincroniza
 * `reset(valoresVigentes)` + el radio de objetivo en CADA apertura,
 * recalculados desde el prop `plan`. Sin esto, reabrir muestra el snapshot
 * de la primera apertura (`useForm({ defaultValues })` solo lee su argumento
 * en el montaje).
 *
 * ADR-5: al elegir un lado del objetivo, `setValue(otroLado, "", {
 * shouldValidate: true, shouldDirty: true })`; el submit manda SIEMPRE el
 * par completo, con el lado descartado en `null` explícito — el backend es
 * PATCH semántico (`undefined` = no tocar) y `PlanPreventivoEntity.editar()`
 * revalida sobre el estado RESULTANTE, no sobre lo que cambió.
 *
 * ADR-6: un `equipoId` fuera del catálogo activo (`GET /equipos` solo trae
 * `activo=true, deletedAt=null`) se muestra con una opción extra, gateada
 * por `equiposQuery.isSuccess` — la ausencia solo prueba algo cuando la
 * lista ya resolvió. `useEquipo` se invoca solo mientras hace falta
 * verificar (`enabled` interno evita el request de más una vez resuelto).
 * El MISMO tratamiento aplica a `prioridadId` y `responsableId` (helper
 * compartido `conValorFueraDeCatalogo`): sus catálogos también excluyen lo dado
 * de baja, así que los tres selects pueden quedarse sin la `<option>` del valor
 * vigente.
 *
 * Ojo que son DOS caminos distintos para el mismo síntoma, y hacen falta los dos
 * arreglos:
 *   (a) el catálogo resolvió y el valor está dado de baja → lo cubre
 *       `conValorFueraDeCatalogo`, agregando la opción sintética.
 *   (b) la opción existe, pero llega DESPUÉS de que el `<select>` montó (se
 *       abrió el diálogo con los catálogos todavía cargando) → lo cubre
 *       `useReaplicarAlResolver`, en los TRES selects.
 * El (b) estuvo cubierto solo para el equipo hasta que una revisión lo encontró
 * en prioridad y responsable; hay un test por select que lo fija.
 *
 * ADR-7: cambiar la cadencia dispara un aviso CUALITATIVO sin fecha
 * (calcularla en el front duplicaría `CalcularCicloService`, una segunda
 * fuente de verdad); la fecha real se relee del listado invalidado después
 * de guardar — la respuesta del PATCH trae el puntero viejo (ver comentario
 * de mecanismo en `use-planes-preventivo-mutations.ts` y "Fuera de alcance"
 * en `tasks.md`).
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { useEquipos, useEquipo } from "@/features/equipos/hooks/use-equipos";
import { usePrioridades } from "@/features/tickets/hooks/use-catalogos";
import { useUsuariosAsignables } from "@/features/tickets/hooks/use-usuarios-asignables";
import { ApiError } from "@/shared/api/types";
import { conValorFueraDeCatalogo, type OpcionCatalogo } from "@/shared/lib/opciones-catalogo";
import { useReaplicarAlResolver } from "@/shared/hooks/use-reaplicar-al-resolver";
import { useEditarPlanPreventivo } from "../hooks/use-planes-preventivo-mutations";
import { editarPlanPreventivoSchema, type EditarPlanPreventivoFormValues } from "../schemas";
import type { EditarPlanPreventivoDto, PlanPreventivo } from "../types";

type Objetivo = "equipo" | "ubicacion";

const AVISO_CADENCIA =
  "Al cambiar la cadencia, la próxima ejecución se recalcula hacia adelante desde hoy. Los ciclos anteriores no se generan.";

export interface PlanPreventivoEditDialogProps {
  plan: PlanPreventivo;
}

function valoresVigentes(plan: PlanPreventivo): EditarPlanPreventivoFormValues {
  return {
    titulo: plan.titulo,
    instrucciones: plan.instrucciones ?? "",
    equipoId: plan.equipoId ?? "",
    ubicacion: plan.ubicacion ?? "",
    prioridadId: plan.prioridadId,
    responsableId: plan.responsableId,
    intervaloValor: String(plan.intervaloValor),
    intervaloUnidad: plan.intervaloUnidad,
    activo: plan.activo,
  };
}

function objetivoDe(plan: PlanPreventivo): Objetivo {
  return plan.equipoId ? "equipo" : "ubicacion";
}

export function PlanPreventivoEditDialog({ plan }: PlanPreventivoEditDialogProps) {
  const [open, setOpen] = useState(false);
  const [objetivo, setObjetivo] = useState<Objetivo>(objetivoDe(plan));
  const equiposQuery = useEquipos();
  const prioridadesQuery = usePrioridades();
  const usuariosQuery = useUsuariosAsignables();
  const editarMutation = useEditarPlanPreventivo(plan.id);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm<EditarPlanPreventivoFormValues>({
    resolver: zodResolver(editarPlanPreventivoSchema),
    defaultValues: valoresVigentes(plan),
  });

  const equiposActivos = equiposQuery.data ?? [];
  // `plan.equipoId` es `string | null` y TS no lo estrecha a través de
  // `necesitaVerificarEquipo`. Normalizar acá evita los dos casts que solo
  // servían para callar al compilador: `useEquipo` ya trata "" como
  // deshabilitado por su `enabled: !!id`.
  const equipoIdDelPlan = plan.equipoId ?? "";
  const equipoEnListaActiva = equiposQuery.isSuccess && equiposActivos.some((equipo) => equipo.id === plan.equipoId);
  // ADR-6: la ausencia solo prueba algo cuando el catálogo YA resolvió. `useEquipo`
  // recibe "" (deshabilitado por su propio `enabled: !!id`) cuando no hace falta
  // verificar, para no disparar el request de más.
  const necesitaVerificarEquipo = !!plan.equipoId && equiposQuery.isSuccess && !equipoEnListaActiva;
  const equipoQuery = useEquipo(necesitaVerificarEquipo ? equipoIdDelPlan : "");

  const opcionesPrioridad = conValorFueraDeCatalogo(
    (prioridadesQuery.data ?? []).map((prioridad) => ({
      id: prioridad.id,
      nombre: prioridad.nombre,
    })),
    prioridadesQuery.isSuccess,
    plan.prioridadId,
    "Prioridad dada de baja",
  );

  const opcionesResponsable = conValorFueraDeCatalogo(
    (usuariosQuery.data ?? []).map((usuario) => ({
      id: usuario.id,
      nombre: `${usuario.nombre} ${usuario.apellido}`,
    })),
    usuariosQuery.isSuccess,
    plan.responsableId,
    "Responsable dado de baja",
  );

  let opcionesEquipo: OpcionCatalogo[] = equiposActivos;
  let mensajeEquipoExtra: string | null = null;
  let selectEquipoDeshabilitado = equiposQuery.isLoading || equiposQuery.isError;

  if (necesitaVerificarEquipo) {
    if (equipoQuery.isLoading) {
      selectEquipoDeshabilitado = true;
    } else if (equipoQuery.isSuccess && equipoQuery.data) {
      opcionesEquipo = [
        ...opcionesEquipo,
        {
          id: equipoQuery.data.id,
          nombre: `${equipoQuery.data.nombre} (dado de baja)`,
        },
      ];
    } else if (equipoQuery.isError) {
      if (equipoQuery.error instanceof ApiError && equipoQuery.error.statusCode === 404) {
        opcionesEquipo = [...opcionesEquipo, { id: equipoIdDelPlan, nombre: "Equipo eliminado del inventario" }];
      } else {
        mensajeEquipoExtra = "No se pudo verificar el equipo";
        selectEquipoDeshabilitado = true;
      }
    }
  }

  // Las opciones del equipo quedan firmes recién cuando el catálogo resolvió Y,
  // si hubo que verificar, también terminó `useEquipo` (con dato o con error).
  // Antes de eso el `<select>` todavía puede recibir una `<option>` más.
  const opcionesEquipoFirmes =
    equiposQuery.isSuccess && (!necesitaVerificarEquipo || equipoQuery.isSuccess || equipoQuery.isError);

  // El equipo suma `objetivo === "equipo"` a su condición de activo, y NO es
  // simetría de más: es el único de los tres que participa del XOR del objetivo
  // (ADR-5). Si el catálogo resuelve tarde y se reaplica `equipoId` cuando el
  // usuario ya se pasó a "Ubicación", el plan queda con los dos lados seteados y
  // el submit muere en la validación. Prioridad y responsable no tienen lado
  // opuesto que pisar, así que les alcanza con `open`.
  useReaplicarAlResolver(open && objetivo === "equipo", opcionesEquipoFirmes, "equipoId", equipoIdDelPlan, setValue);
  useReaplicarAlResolver(open, prioridadesQuery.isSuccess, "prioridadId", plan.prioridadId, setValue);
  useReaplicarAlResolver(open, usuariosQuery.isSuccess, "responsableId", plan.responsableId, setValue);

  const avisaCadencia = !!(dirtyFields.intervaloValor || dirtyFields.intervaloUnidad);

  function elegirObjetivo(tipo: Objetivo) {
    setObjetivo(tipo);
    if (tipo === "equipo") setValue("ubicacion", "", { shouldValidate: true, shouldDirty: true });
    else setValue("equipoId", "", { shouldValidate: true, shouldDirty: true });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // Sincroniza en cada apertura (ADR-4): el diálogo no se desmonta al
    // cerrarse, así que sin este `reset` reabrir muestra el snapshot viejo.
    if (next) {
      reset(valoresVigentes(plan));
      setObjetivo(objetivoDe(plan));
    }
  }

  function submit(values: EditarPlanPreventivoFormValues) {
    const dto: EditarPlanPreventivoDto = {
      titulo: values.titulo,
      instrucciones: values.instrucciones || null,
      // ADR-5: el par completo, con el lado descartado en `null` EXPLÍCITO —
      // omitirlo dejaría el plan con los dos objetivos seteados y el dominio
      // respondería 422 `ObjetivoInvalidoError`.
      equipoId: objetivo === "equipo" ? values.equipoId || null : null,
      // Ya viene normalizada (trim + mayúscula) del schema, que normaliza ANTES
      // de medir el tope. Volver a normalizar acá reabriría el hueco: lo validado
      // y lo enviado tienen que ser el mismo string.
      ubicacion: objetivo === "ubicacion" ? values.ubicacion || null : null,
      prioridadId: values.prioridadId,
      responsableId: values.responsableId,
      intervaloValor: Number(values.intervaloValor),
      intervaloUnidad: values.intervaloUnidad,
      activo: values.activo,
    };
    editarMutation.mutate(dto, { onSuccess: () => setOpen(false) });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar plan de mantenimiento preventivo</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="plan-editar-titulo" className="text-sm font-medium text-foreground">
              Título
            </label>
            <Input id="plan-editar-titulo" error={!!errors.titulo} {...register("titulo")} />
            {errors.titulo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.titulo.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="plan-editar-instrucciones" className="text-sm font-medium text-foreground">
              Instrucciones
            </label>
            <Textarea id="plan-editar-instrucciones" rows={3} {...register("instrucciones")} />
          </div>

          <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium text-foreground">Objetivo</legend>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="plan-editar-objetivo"
                  checked={objetivo === "equipo"}
                  onChange={() => elegirObjetivo("equipo")}
                />
                Equipo
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="plan-editar-objetivo"
                  checked={objetivo === "ubicacion"}
                  onChange={() => elegirObjetivo("ubicacion")}
                />
                Ubicación
              </label>
            </div>

            {objetivo === "equipo" && (
              <div className="flex flex-col gap-1">
                <label htmlFor="plan-editar-equipo" className="text-sm font-medium text-foreground">
                  Equipo
                </label>
                <Select
                  id="plan-editar-equipo"
                  error={!!errors.equipoId}
                  disabled={selectEquipoDeshabilitado}
                  {...register("equipoId")}
                >
                  <option value="">Elegí un equipo</option>
                  {opcionesEquipo.map((equipo) => (
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
                {mensajeEquipoExtra && (
                  <p role="alert" className="text-sm text-destructive">
                    {mensajeEquipoExtra}
                  </p>
                )}
              </div>
            )}
            {objetivo === "ubicacion" && (
              <div className="flex flex-col gap-1">
                <label htmlFor="plan-editar-ubicacion" className="text-sm font-medium text-foreground">
                  Ubicación
                </label>
                <Input
                  id="plan-editar-ubicacion"
                  className="uppercase placeholder:normal-case"
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
            <label htmlFor="plan-editar-prioridad" className="text-sm font-medium text-foreground">
              Prioridad
            </label>
            <Select id="plan-editar-prioridad" error={!!errors.prioridadId} {...register("prioridadId")}>
              {opcionesPrioridad.map((prioridad) => (
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
            <label htmlFor="plan-editar-responsable" className="text-sm font-medium text-foreground">
              Responsable
            </label>
            <Select id="plan-editar-responsable" error={!!errors.responsableId} {...register("responsableId")}>
              {opcionesResponsable.map((responsable) => (
                <option key={responsable.id} value={responsable.id}>
                  {responsable.nombre}
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
                No se pudo cargar la lista de responsables. Puede deberse a que no tenés permiso para ver usuarios
                (depende de un permiso independiente de este formulario).
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="plan-editar-cadencia" className="text-sm font-medium text-foreground">
                Cadencia
              </label>
              <Input
                id="plan-editar-cadencia"
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
              <label htmlFor="plan-editar-unidad" className="text-sm font-medium text-foreground">
                Unidad
              </label>
              <Select id="plan-editar-unidad" {...register("intervaloUnidad")}>
                <option value="DIAS">Días</option>
                <option value="MESES">Meses</option>
              </Select>
            </div>
          </div>
          {avisaCadencia && <p className="text-sm text-muted-foreground">{AVISO_CADENCIA}</p>}

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input id="plan-editar-activo" type="checkbox" className="h-4 w-4 accent-primary" {...register("activo")} />
            Plan activo
          </label>

          <div className="flex justify-end gap-2">
            <Button type="submit" isLoading={editarMutation.isPending}>
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
