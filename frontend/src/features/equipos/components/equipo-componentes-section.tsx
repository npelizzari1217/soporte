"use client";

/**
 * EquipoComponentesSection — agregar/eliminar componentes de un equipo
 * (T5.14). Gate `equipo:gestionar`. `componentes` inicial viene EMBEBIDO de
 * `GET /equipos/:id` (item 1 backend-gaps — cierra G7), pasado por
 * `EquipoDetailView`; siembra el cache local (`["componentes", equipoId]`),
 * que las mutaciones siguen actualizando optimistamente. `tipoComponenteId`
 * viene del catálogo READ-ONLY `GET /equipos/tipos-componente` (F3-Q3).
 */
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Can } from "@/components/shared/can";
import { useTiposComponente } from "../hooks/use-equipos";
import { useAgregarComponente, useEliminarComponente } from "../hooks/use-equipo-mutations";
import { componenteSchema, type ComponenteFormValues } from "../schemas";
import type { Componente } from "../types";

export interface EquipoComponentesSectionProps {
  equipoId: string;
  componentes: Componente[];
}

export function EquipoComponentesSection({ equipoId, componentes }: EquipoComponentesSectionProps) {
  const componentesQuery = useQuery<Componente[]>({
    queryKey: ["componentes", equipoId],
    queryFn: () => Promise.resolve(componentes),
    initialData: componentes,
    staleTime: Infinity,
  });
  const tiposComponenteQuery = useTiposComponente();
  const agregarMutation = useAgregarComponente(equipoId);
  const eliminarMutation = useEliminarComponente(equipoId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ComponenteFormValues>({ resolver: zodResolver(componenteSchema) });

  const tipoNombreMap = new Map((tiposComponenteQuery.data ?? []).map((t) => [t.id, t.nombre]));

  function submit(values: ComponenteFormValues) {
    agregarMutation.mutate(
      {
        tipoComponenteId: values.tipoComponenteId,
        descripcion: values.descripcion || undefined,
        numeroSerie: values.numeroSerie || undefined,
        capacidad: values.capacidad || undefined,
      },
      { onSuccess: () => reset() },
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">Componentes</h2>
      <ul className="flex flex-col gap-2">
        {(componentesQuery.data ?? []).map((componente) => (
          <li
            key={componente.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-border p-2"
          >
            <span className="text-sm text-foreground">
              {tipoNombreMap.get(componente.tipoComponenteId) ?? componente.tipoComponenteId}
              {componente.capacidad ? ` — ${componente.capacidad}` : ""}
            </span>
            <Can permiso="equipo:gestionar">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Eliminar componente"
                onClick={() => eliminarMutation.mutate(componente.id)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Can>
          </li>
        ))}
      </ul>

      <Can permiso="equipo:gestionar">
        <form onSubmit={handleSubmit(submit)} className="flex flex-wrap items-end gap-2" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="componente-tipo" className="text-xs font-medium text-foreground">
              Tipo
            </label>
            <Select
              id="componente-tipo"
              error={!!errors.tipoComponenteId}
              defaultValue=""
              {...register("tipoComponenteId")}
            >
              <option value="" disabled>
                Elegí un tipo
              </option>
              {(tiposComponenteQuery.data ?? []).map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="componente-capacidad" className="text-xs font-medium text-foreground">
              Capacidad
            </label>
            <Input id="componente-capacidad" {...register("capacidad")} />
          </div>
          <Button type="submit" size="sm" isLoading={agregarMutation.isPending}>
            Agregar componente
          </Button>
        </form>
      </Can>
    </section>
  );
}
