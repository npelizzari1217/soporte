"use client";

/**
 * EquipoComponentesSection — agregar/editar/dar de baja/reactivar
 * componentes de un equipo (T5.14, listado enriquecido de componentes).
 * Gate `equipo:gestionar`. `componentes` inicial viene EMBEBIDO de
 * `GET /equipos/:id` (item 1 backend-gaps — cierra G7), pasado por
 * `EquipoDetailView`; siembra el cache local (`["componentes", equipoId]`),
 * que el `useEffect` de abajo sincroniza cuando llega un `componentes`
 * fresco por props (p.ej. tras invalidar `["equipo", equipoId]` desde las
 * mutaciones de baja/editar/reactivar — ver nota en `use-equipo-mutations`).
 *
 * Listado enriquecido: el detalle ahora trae TODOS los componentes
 * (activos + dados de baja, no solo los activos) — se muestran juntos,
 * ordenados (`ordenarComponentes`: activos primero, luego dados de baja,
 * cada grupo alfabético) y los INACTIVOS tachados/grises, sin
 * Editar/Dar de baja pero con "Reactivar".
 *
 * PR6 (sdd/tipos-componente-master): el nombre/estado de un componente YA
 * ASIGNADO se resuelve del dato EMBEBIDO (`tipoNombre`/`tipoActivo`), NUNCA
 * del catálogo de activos — ese catálogo (`useTiposComponente()`) solo
 * lista tipos vigentes, así que un componente con un tipo dado de baja
 * caía al fallback (UUID/código crudo). Un tipo inactivo muestra un aviso
 * "Dado de baja" (distinto del propio componente estar dado de baja). El
 * alta sigue restringida a tipos activos (selector) y envía
 * `tipoComponenteCodigo`; como la respuesta del `POST` no trae
 * `tipoNombre`/`tipoActivo` (shape básico), se enriquece acá con el
 * catálogo ya cargado (siempre activo, por venir del selector).
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Can } from "@/components/shared/can";
import { useTiposComponente } from "../hooks/use-equipos";
import {
  useAgregarComponente,
  useEliminarComponente,
  useReactivarComponente,
} from "../hooks/use-equipo-mutations";
import { componenteSchema, type ComponenteFormValues } from "../schemas";
import { ordenarComponentes } from "../ordenar-componentes";
import type { ComponenteConTipo } from "../types";
import { ComponenteEditDialog } from "./componente-edit-dialog";

export interface EquipoComponentesSectionProps {
  equipoId: string;
  componentes: ComponenteConTipo[];
}

/** Fecha corta + hora, mismo formato que `TicketTimeline` (sin util compartido en el repo). */
function formatFecha(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
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
  const reactivarMutation = useReactivarComponente(equipoId);

  // El cache local (`staleTime: Infinity`) solo se actualiza por las mutaciones
  // locales de agregar/quitar. Cuando el detalle del equipo se re-fetchea (p.ej.
  // al desactivar un tipo desde el ABM, que invalida `["equipo"]`), llega un
  // `componentes` fresco por props: lo sincronizamos para que el aviso "Dado de
  // baja" y los nombres reflejen el estado actual sin recarga dura (F5).
  useEffect(() => {
    queryClient.setQueryData<ComponenteConTipo[]>(["componentes", equipoId], componentes);
  }, [componentes, equipoId, queryClient]);

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
        {ordenarComponentes(componentesQuery.data ?? []).map((componente) => (
          <li
            key={componente.id}
            className={cn(
              "flex items-center justify-between gap-2 rounded-lg border border-border p-2",
              !componente.activo && "opacity-80",
            )}
          >
            <div className="flex flex-col gap-0.5">
              <span
                className={cn(
                  "flex items-center gap-2 text-sm",
                  componente.activo ? "text-foreground" : "text-muted-foreground line-through",
                )}
              >
                <span>
                  {componente.tipoNombre ?? componente.tipoComponenteCodigo}
                  {componente.capacidad ? ` — ${componente.capacidad}` : ""}
                </span>
                {!componente.tipoActivo && <Badge variant="outline">Dado de baja</Badge>}
              </span>
              <span className="text-xs text-muted-foreground">
                Creado: {formatFecha(componente.createdAt)} · Actualizado: {formatFecha(componente.updatedAt)}
                {!componente.activo && componente.deletedAt && (
                  <> · Dado de baja: {formatFecha(componente.deletedAt)}</>
                )}
              </span>
            </div>
            <Can permiso="equipo:gestionar">
              {componente.activo ? (
                <div className="flex items-center gap-1">
                  <ComponenteEditDialog equipoId={equipoId} componente={componente} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Dar de baja componente"
                    onClick={() => eliminarMutation.mutate(componente.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  // Loading solo en la fila que se reactiva (la mutación es una
                  // por sección, compartida entre inactivos): mirar `variables`.
                  isLoading={reactivarMutation.isPending && reactivarMutation.variables === componente.id}
                  onClick={() => reactivarMutation.mutate(componente.id)}
                >
                  Reactivar
                </Button>
              )}
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
