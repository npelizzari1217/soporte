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
import { conValorFueraDeCatalogo } from "@/shared/lib/opciones-catalogo";
import { useReaplicarAlResolver } from "@/shared/hooks/use-reaplicar-al-resolver";
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

export function TicketEditForm({ defaultValues, prioridades, onSubmit, onCancel, isSubmitting }: TicketEditFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<EditarTicketFormValues>({
    resolver: zodResolver(editarTicketSchema),
    defaultValues,
  });

  // El catálogo excluye lo dado de baja, así que la `prioridadId` vigente puede
  // no tener `<option>`: sin ella el `<select>` nativo no encuentra ningún valor
  // que matchee y la pantalla muestra algo distinto de lo que `_formValues`
  // guarda. El criterio (incluido por qué la ausencia solo cuenta con el catálogo
  // YA resuelto) vive en `shared/lib/opciones-catalogo`, compartido con el
  // diálogo de edición de planes preventivos.
  //
  // `prioridades !== undefined` ES el "resolvió": el caller pasa
  // `usePrioridades().data` tal cual, y React Query deja ese campo en `undefined`
  // mientras carga o si falló. Mientras no resolvió, el select no muestra ninguna
  // opción; `_formValues` conserva el id igual (§4 del design), así que el
  // payload no se corrompe.
  const opcionesPrioridad = conValorFueraDeCatalogo(
    prioridades ?? [],
    prioridades !== undefined,
    defaultValues.prioridadId,
    "Prioridad dada de baja",
  );

  // Segundo camino para el mismo síntoma, con el mismo hook compartido que usa
  // el diálogo de planes preventivos: si el formulario monta con el catálogo
  // todavía sin resolver, el `<select>` queda con la primera opción que llegue.
  //
  // `activo` va en `true` fijo: este componente es presentacional y monta y
  // desmonta con su caller, así que no tiene el ciclo abrir/cerrar que sí tiene
  // un diálogo. Lo que NO se puede omitir es el hook: hacer esto con un
  // `useEffect` suelto sin `ref` haría que un refetch del catálogo pise la
  // prioridad que el usuario acaba de elegir.
  useReaplicarAlResolver(true, prioridades !== undefined, "prioridadId", defaultValues.prioridadId, setValue);

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
