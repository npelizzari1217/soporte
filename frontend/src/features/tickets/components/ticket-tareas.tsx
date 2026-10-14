"use client";

/**
 * TicketTareas — tareas de un ticket de cualquier tipo, con su avance
 * (odd/tareas-con-tecnico, T6; CA1-CA4, CA7). Lo montan el detalle del ticket
 * y el diálogo de Edilicia, keyed por el `ticketId`.
 *
 * Los botones siguen `permisos-tareas.ts` (espejo de CA3/CA4); el backend sigue
 * siendo la autoridad y sus 403/404/409/422 llegan como toast (`notifyError`).
 */
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { QueryKey } from "@tanstack/react-query";
import { CheckCircle2, Circle, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useSession } from "@/shared/hooks/use-session";
import { formatearInstante } from "@/shared/lib/formato-fecha";
import {
  useAsignarTecnicoTarea,
  useCompletarTarea,
  useCrearTarea,
  useDescompletarTarea,
  useEliminarTarea,
  useTareasTicket,
  useTecnicosElegiblesTarea,
} from "../hooks/use-tareas-ticket";
import { puedeCompletarTareaUi, puedeGestionarTareasUi, type ActorTareasUi } from "../lib/permisos-tareas";
import { crearTareaSchema, type CrearTareaFormValues } from "../schemas";
import type { TareaTicket } from "../types";

export interface TicketTareasProps {
  ticketId: string;
  /** Responsable del ticket; `undefined` si no se lo pudo leer (ver `permisos-tareas.ts`). */
  asignadoId: string | null | undefined;
  /** Módulo del tipo del ticket; `undefined` mientras el catálogo no resolvió. */
  modulo: string | undefined;
  /** Queries extra que una mutación deja viejas (Edilicia: `["reparaciones"]`). */
  invalidarTambien?: readonly QueryKey[];
  /** Qué mostrar si el listado falla (Edilicia: sus subtareas embebidas, de solo lectura). */
  respaldoSiFalla?: ReactNode;
}

function nombreDe(id: string | null, nombre: string | null, apellido: string | null): string | null {
  if (!id) return null;
  return nombre || apellido ? `${nombre ?? ""} ${apellido ?? ""}`.trim() : "Usuario";
}

export function TicketTareas({ ticketId, asignadoId, modulo, invalidarTambien, respaldoSiFalla }: TicketTareasProps) {
  const { user, can, esAdminCliente } = useSession();
  const actor: ActorTareasUi = {
    id: user?.sub ?? "",
    esAdministrador: esAdminCliente,
    // Sin módulo resuelto no se esconde nada: decide el backend.
    tieneModificacionDelModulo: modulo === undefined || can(`${modulo}:MODIFICACION`),
  };
  const puedeGestionar = !!user && puedeGestionarTareasUi(actor, asignadoId);

  const tareasQuery = useTareasTicket(ticketId);
  const elegiblesQuery = useTecnicosElegiblesTarea(ticketId, puedeGestionar);
  const opciones = { invalidarTambien };
  const crear = useCrearTarea(ticketId, opciones);
  const asignar = useAsignarTecnicoTarea(ticketId, opciones);
  const completar = useCompletarTarea(ticketId, opciones);
  const descompletar = useDescompletarTarea(ticketId, opciones);
  const eliminar = useEliminarTarea(ticketId, opciones);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CrearTareaFormValues>({ resolver: zodResolver(crearTareaSchema) });

  if (tareasQuery.isLoading) return <p className="text-sm text-muted-foreground">Cargando tareas…</p>;
  if (tareasQuery.isError || !tareasQuery.data) {
    if (respaldoSiFalla) return <>{respaldoSiFalla}</>;
    return <p className="text-sm text-destructive">No se pudieron cargar las tareas.</p>;
  }

  const { items, avance } = tareasQuery.data;
  const elegibles = elegiblesQuery.data ?? [];

  function opcionesTecnico(tarea: TareaTicket) {
    // El técnico actual puede ya no ser elegible: se lo muestra igual para no mentir.
    const actual = tarea.tecnicoId;
    const fueraDeLista = actual !== null && !elegibles.some((t) => t.id === actual);
    return [
      ...(fueraDeLista
        ? [{ id: actual, etiqueta: nombreDe(actual, tarea.tecnicoNombre, tarea.tecnicoApellido) }]
        : []),
      ...elegibles.map((t) => ({ id: t.id, etiqueta: `${t.nombre} ${t.apellido}` })),
    ];
  }

  return (
    <div className="flex flex-col gap-3">
      {avance.total > 0 ? (
        <div className="flex items-center gap-2" aria-label="Avance de las tareas">
          <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, avance.porcentaje))}%` }} />
          </div>
          <span className="text-xs text-muted-foreground">
            {avance.porcentaje}% · {avance.completadas} de {avance.total} completadas
          </span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sin tareas todavía.</p>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((tarea) => {
          const tecnico = nombreDe(tarea.tecnicoId, tarea.tecnicoNombre, tarea.tecnicoApellido);
          const completadaPor = nombreDe(tarea.completadaPorId, tarea.completadaPorNombre, tarea.completadaPorApellido);
          const puedeCompletar = !!user && puedeCompletarTareaUi(actor, asignadoId, tarea.tecnicoId);
          return (
            <li key={tarea.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2">
              <div className="flex items-start gap-2">
                {tarea.completada ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" aria-hidden="true" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                )}
                <div className="flex flex-col gap-0.5">
                  <span className={tarea.completada ? "text-sm text-muted-foreground line-through" : "text-sm text-foreground"}>
                    {tarea.descripcion}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {tecnico ? `Técnico: ${tecnico}` : "Sin técnico"}
                  </span>
                  {tarea.completada && tarea.completadaEn && (
                    <span className="text-xs text-muted-foreground">
                      Completada el {formatearInstante(tarea.completadaEn)}
                      {completadaPor ? ` por ${completadaPor}` : ""}
                    </span>
                  )}
                </div>
                <Badge variant={tarea.completada ? "success-light" : "outline"}>
                  {tarea.completada ? "Completada" : "Pendiente"}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                {puedeGestionar && (
                  <Select
                    aria-label={`Técnico de la tarea ${tarea.descripcion}`}
                    value={tarea.tecnicoId ?? ""}
                    disabled={asignar.isPending}
                    onChange={(e) => asignar.mutate({ tareaId: tarea.id, tecnicoId: e.target.value || null })}
                  >
                    <option value="">Sin técnico</option>
                    {opcionesTecnico(tarea).map((opcion) => (
                      <option key={opcion.id} value={opcion.id}>
                        {opcion.etiqueta}
                      </option>
                    ))}
                  </Select>
                )}
                {puedeCompletar &&
                  (tarea.completada ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      isLoading={descompletar.isPending && descompletar.variables === tarea.id}
                      onClick={() => descompletar.mutate(tarea.id)}
                    >
                      Descompletar
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      isLoading={completar.isPending && completar.variables === tarea.id}
                      onClick={() => completar.mutate(tarea.id)}
                    >
                      Completar
                    </Button>
                  ))}
                {puedeGestionar && (
                  <ConfirmDialog
                    trigger={
                      <Button type="button" variant="ghost" size="sm" aria-label={`Eliminar tarea ${tarea.descripcion}`}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    }
                    title="¿Eliminar la tarea?"
                    description={`«${tarea.descripcion}» deja de contar para el avance. No se puede deshacer.`}
                    confirmLabel="Eliminar"
                    confirmVariant="destructive"
                    isConfirming={eliminar.isPending}
                    onConfirm={() => eliminar.mutate(tarea.id)}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {puedeGestionar && (
        <form
          onSubmit={handleSubmit((values) => crear.mutate(values, { onSuccess: () => reset() }))}
          className="flex items-end gap-2"
          noValidate
        >
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor={`nueva-tarea-${ticketId}`} className="text-xs font-medium text-foreground">
              Nueva tarea
            </label>
            <Input id={`nueva-tarea-${ticketId}`} error={!!errors.descripcion} {...register("descripcion")} />
            {errors.descripcion && <p className="text-xs text-destructive">{errors.descripcion.message}</p>}
          </div>
          <Button type="submit" size="sm" isLoading={crear.isPending}>
            Agregar
          </Button>
        </form>
      )}
    </div>
  );
}
