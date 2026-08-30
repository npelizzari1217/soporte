"use client";

/**
 * TicketEditForm — PRESENTATIONAL, gated por `ticket:editar` a nivel de
 * caller (`TicketDetailView` decide si montarlo, vía `<Can>`). Edita
 * titulo/descripcion/prioridadId — el `estado` NUNCA se edita acá (backend:
 * `EditTicketDto` no acepta `estado`, endpoint dedicado).
 */
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { editarTicketSchema, type EditarTicketFormValues } from "../schemas";
import type { Prioridad } from "../types";

export interface TicketEditFormProps {
  defaultValues: EditarTicketFormValues;
  /**
   * `undefined` = el catálogo de prioridades TODAVÍA NO RESOLVIÓ (cargando o
   * con error) — mismo significado que `usePrioridades().data` en React
   * Query, que el caller pasa tal cual. `[]` = resolvió con éxito y no hay
   * ninguna prioridad activa. La distinción importa: ausencia en un catálogo
   * que no resolvió NO es evidencia de que la prioridad esté dada de baja,
   * es evidencia de que todavía no se sabe (AGENTS.md — un control tiene que
   * espejar TODAS las precondiciones, no algunas).
   */
  prioridades: Prioridad[] | undefined;
  onSubmit: (values: EditarTicketFormValues) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function TicketEditForm({
  defaultValues,
  prioridades,
  onSubmit,
  onCancel,
  isSubmitting,
}: TicketEditFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditarTicketFormValues>({
    resolver: zodResolver(editarTicketSchema),
    defaultValues,
  });

  // El catálogo excluye lo dado de baja, así que la `prioridadId` vigente
  // puede no tener `<option>`: sin ella el `<select>` nativo no encuentra
  // ningún valor que matchee y la pantalla muestra algo distinto de lo que
  // `_formValues` guarda. Se detecta por AUSENCIA en la lista traída, pero
  // SOLO cuando esa lista ya resolvió (`prioridades !== undefined`): con el
  // catálogo cargando o caído, la ausencia no prueba nada, y agregar la
  // etiqueta ahí sería mentirle al usuario sobre un valor que en realidad
  // sigue activo (defecto encontrado en revisión — antes `?? []` colapsaba
  // "cargando"/"error"/"vacío" en el mismo array vacío). Mientras no resolvió,
  // el select simplemente no muestra ninguna opción; `_formValues` conserva
  // el id igual (§4 del design), así que el payload no se corrompe.
  const catalogoResuelto = prioridades !== undefined;
  const listaPrioridades = prioridades ?? [];
  const opcionesPrioridad: { id: string; nombre: string }[] =
    catalogoResuelto && !listaPrioridades.some((prioridad) => prioridad.id === defaultValues.prioridadId)
      ? [...listaPrioridades, { id: defaultValues.prioridadId, nombre: "Prioridad dada de baja" }]
      : listaPrioridades;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor="edit-titulo" className="text-sm font-medium text-foreground">
          Título
        </label>
        <Input id="edit-titulo" error={!!errors.titulo} {...register("titulo")} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="edit-descripcion" className="text-sm font-medium text-foreground">
          Descripción
        </label>
        <Textarea id="edit-descripcion" {...register("descripcion")} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="edit-prioridad" className="text-sm font-medium text-foreground">
          Prioridad
        </label>
        <Select id="edit-prioridad" error={!!errors.prioridadId} {...register("prioridadId")}>
          {opcionesPrioridad.map((opcion) => (
            <option key={opcion.id} value={opcion.id}>
              {opcion.nombre}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex gap-2">
        <Button type="submit" isLoading={isSubmitting}>
          Guardar
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
