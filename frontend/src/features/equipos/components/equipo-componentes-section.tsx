"use client";

/**
 * EquipoComponentesSection — editar/dar de baja/reactivar componentes de un
 * equipo (T5.14, listado enriquecido de componentes). Gate
 * `equipo:gestionar`. `componentes` inicial viene EMBEBIDO de
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
 * "Dado de baja" (distinto del propio componente estar dado de baja).
 *
 * WU3 (spec R4/R6): el alta YA NO vive acá — el form inline (solo tipo +
 * capacidad, incompleto) fue retirado. El alta vive en `ComponenteCreateDialog`,
 * montado en el toolbar de `EquipoDetailView`, y refresca esta sección por
 * invalidación de `["equipo", equipoId]` (mismo criterio que
 * baja/editar/reactivar), NO por actualización optimista del cache local.
 *
 * WU4 (spec R5): listado en tabla de 4 columnas (Tipo / Descripción / Nro de
 * serie / Capacidad) + una 5ta columna de Acciones (`sr-only`, solo lectores
 * de pantalla). Cada componente ocupa un `<tbody>` propio con DOS filas:
 * los 4 datos + la celda de acciones (`rowSpan={2}`), y una fila debajo con
 * la línea de metadata (creado/actualizado/dado de baja) en un `colSpan={4}`
 * — la metadata NO es una columna. Regresión visual ACEPTADA: el `rounded-lg`
 * por fila se pierde porque Preflight fuerza `border-collapse: collapse` en
 * `<table>`; se compensa con un borde inferior por `<tbody>`. Confirmado con
 * el usuario.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/shared/can";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useEliminarComponente, useReactivarComponente } from "../hooks/use-equipo-mutations";
import { ordenarComponentes } from "../ordenar-componentes";
import type { ComponenteConTipo } from "../types";
import { ComponenteEditDialog } from "./componente-edit-dialog";

/** Aplicada a cada una de las 4 celdas de dato cuando el componente está dado de baja. */
const CELL_INACTIVO = "text-muted-foreground line-through";

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

  const componentesOrdenados = ordenarComponentes(componentesQuery.data ?? []);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">Componentes</h2>
      {componentesOrdenados.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin componentes.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Nro de serie</TableHead>
              <TableHead>Capacidad</TableHead>
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          {componentesOrdenados.map((componente) => (
            <TableBody
              key={componente.id}
              data-testid={`componente-${componente.id}`}
              className={cn("border-b border-border", !componente.activo && "opacity-80")}
            >
              {/*
               * `border-b-0`: `TableRow` trae `border-b` fijo y `TableBody` solo lo
               * anula en `tr:last-child`. Como cada componente es un <tbody> de DOS
               * filas, sin esto la fila de datos conserva su borde y queda una línea
               * ADENTRO del grupo, separando al componente de su propia metadata. El
               * borde que separa componentes entre sí es el del <tbody>, no este.
               */}
              <TableRow className="border-b-0">
                <TableCell className={cn(!componente.activo && CELL_INACTIVO)}>
                  <span className="flex items-center gap-2">
                    {componente.tipoNombre ?? componente.tipoComponenteCodigo}
                    {!componente.tipoActivo && <Badge variant="outline">Dado de baja</Badge>}
                  </span>
                </TableCell>
                <TableCell className={cn(!componente.activo && CELL_INACTIVO)}>
                  {componente.descripcion ?? <span aria-hidden="true">—</span>}
                </TableCell>
                <TableCell className={cn(!componente.activo && CELL_INACTIVO)}>
                  {componente.numeroSerie ?? <span aria-hidden="true">—</span>}
                </TableCell>
                <TableCell className={cn(!componente.activo && CELL_INACTIVO)}>
                  {componente.capacidad ?? <span aria-hidden="true">—</span>}
                </TableCell>
                <TableCell rowSpan={2}>
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
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={4} className="pt-0 text-xs text-muted-foreground">
                  Creado: {formatFecha(componente.createdAt)} · Actualizado: {formatFecha(componente.updatedAt)}
                  {!componente.activo && componente.deletedAt && (
                    <> · Dado de baja: {formatFecha(componente.deletedAt)}</>
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          ))}
        </Table>
      )}
    </section>
  );
}
