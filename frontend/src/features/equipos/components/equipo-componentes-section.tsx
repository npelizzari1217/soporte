"use client";

/**
 * EquipoComponentesSection — agregar/eliminar componentes de un equipo
 * (T5.14). Gate `equipo:gestionar`. `componentes` inicial viene EMBEBIDO de
 * `GET /equipos/:id` (item 1 backend-gaps — cierra G7), pasado por
 * `EquipoDetailView`; siembra el cache local (`["componentes", equipoId]`),
 * que las mutaciones siguen actualizando optimistamente.
 *
 * PR6 (sdd/tipos-componente-master): el nombre/estado de un componente YA
 * ASIGNADO se resuelve del dato EMBEBIDO (`tipoNombre`/`tipoActivo`), NUNCA
 * del catálogo de activos — ese catálogo (`useTiposComponente()`) solo
 * lista tipos vigentes, así que un componente con un tipo dado de baja
 * caía al fallback (UUID/código crudo). Un tipo inactivo muestra un aviso
 * "Dado de baja". El alta sigue restringida a tipos activos (selector) y
 * envía `tipoComponenteCodigo`; como la respuesta del `POST` no trae
 * `tipoNombre`/`tipoActivo` (shape básico), se enriquece acá con el
 * catálogo ya cargado (siempre activo, por venir del selector).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Can } from "@/components/shared/can";
import { useTiposComponente } from "../hooks/use-equipos";
import { useAgregarComponente, useEliminarComponente } from "../hooks/use-equipo-mutations";
import { componenteSchema, type ComponenteFormValues } from "../schemas";
import type { ComponenteConTipo } from "../types";

export interface EquipoComponentesSectionProps {
  equipoId: string;
  componentes: ComponenteConTipo[];
}

export function EquipoComponentesSection({ equipoId, componentes }: EquipoComponentesSectionProps) {
  const queryClient = useQueryClient();
  const componentesQuery = useQuery<ComponenteConTipo[]>({
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

  function submit(values: ComponenteFormValues) {
    const tipoNombre = tiposComponenteQuery.data?.find((t) => t.codigo === values.tipoComponenteCodigo)?.nombre ?? null;

    agregarMutation.mutate(
      {
        tipoComponenteCodigo: values.tipoComponenteCodigo,
        descripcion: values.descripcion || undefined,
        numeroSerie: values.numeroSerie || undefined,
        capacidad: values.capacidad || undefined,
      },
      {
        onSuccess: (nuevoComponente) => {
          // El selector solo lista tipos activos → `tipoActivo: true` siempre es correcto acá.
          queryClient.setQueryData<ComponenteConTipo[]>(["componentes", equipoId], (old = []) => [
            ...old,
            { ...nuevoComponente, tipoNombre, tipoActivo: true },
          ]);
          reset();
        },
      },
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
            <span className="flex items-center gap-2 text-sm text-foreground">
              <span>
                {componente.tipoNombre ?? componente.tipoComponenteCodigo}
                {componente.capacidad ? ` — ${componente.capacidad}` : ""}
              </span>
              {!componente.tipoActivo && <Badge variant="outline">Dado de baja</Badge>}
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
              error={!!errors.tipoComponenteCodigo}
              defaultValue=""
              {...register("tipoComponenteCodigo")}
            >
              <option value="" disabled>
                Elegí un tipo
              </option>
              {(tiposComponenteQuery.data ?? []).map((tipo) => (
                <option key={tipo.codigo} value={tipo.codigo}>
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
