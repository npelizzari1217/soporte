"use client";

/**
 * use-tareas-ticket — CONTAINER hooks de las tareas de un ticket de cualquier
 * tipo (odd/tareas-con-tecnico, T6), sobre las rutas de `TareasTicketController`:
 *
 *   GET    /tickets/:id/tareas                        → { items, avance }
 *   GET    /tickets/:id/tareas/tecnicos-elegibles     → selector de técnico
 *   POST   /tickets/:id/tareas                        → alta
 *   PATCH  /tickets/:id/tareas/:tareaId/tecnico       → asignar (`null` quita)
 *   POST   /tickets/:id/tareas/:tareaId/completar | descompletar
 *   DELETE /tickets/:id/tareas/:tareaId               → baja lógica (204)
 *
 * Cada mutación invalida las tareas y el historial del ticket (las cinco
 * escriben una operación), más las `invalidarTambien` del caller: Edilicia
 * pasa `["reparaciones"]`, porque el avance de su listado se calcula sobre
 * estas mismas tareas.
 *
 * Errores: el `message` de Nest para tareas lleva ids crudos ("La tarea
 * "<uuid>" ya está completada."), así que 403/404/409/422 se traducen a un
 * toast propio por código; el resto sigue `notifyError`. Un 404 o un 409 dicen
 * que la lista quedó vieja, y un 403 puede venir de una tarea que cambió de
 * técnico en el medio (JD-S2), así que los tres también la refrescan.
 */
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { toast } from "sonner";
import { ApiError } from "@/shared/api/types";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { TareaTicket, TareasTicketResponse, TecnicoAsignable } from "../types";

export const tareasTicketKey = (ticketId: string) => ["ticket", ticketId, "tareas"] as const;

export function useTareasTicket(ticketId: string, enabled = true) {
  return useQuery({
    queryKey: tareasTicketKey(ticketId),
    queryFn: () => apiFetch<TareasTicketResponse>(`tickets/${ticketId}/tareas`),
    enabled: enabled && !!ticketId,
  });
}

/** Lo pide solo quien puede asignar: a cualquier otro el backend le responde 403. */
export function useTecnicosElegiblesTarea(ticketId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["ticket", ticketId, "tareas-tecnicos-elegibles"],
    queryFn: () => apiFetch<TecnicoAsignable[]>(`tickets/${ticketId}/tareas/tecnicos-elegibles`),
    staleTime: 60_000,
    enabled: enabled && !!ticketId,
  });
}

const MENSAJES_ERROR_TAREA: Readonly<Record<number, string>> = {
  403: "No tiene permiso para hacer eso con las tareas de este ticket.",
  404: "La tarea ya no existe. Actualizamos la lista.",
  409: "La tarea ya estaba en ese estado. Actualizamos la lista.",
  422: "Ese técnico no puede tomar tareas de este ticket.",
};

export interface OpcionesMutacionTareas {
  invalidarTambien?: readonly QueryKey[];
}

function useMutacionTarea<V, R>(
  ticketId: string,
  mutationFn: (variables: V) => Promise<R>,
  mensajeExito: string,
  { invalidarTambien = [] }: OpcionesMutacionTareas,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tareasTicketKey(ticketId) });
      queryClient.invalidateQueries({ queryKey: ["ticket", ticketId, "timeline"] });
      for (const queryKey of invalidarTambien) queryClient.invalidateQueries({ queryKey });
      notifySuccess(mensajeExito);
    },
    onError: (error: unknown) => {
      const mensaje = error instanceof ApiError ? MENSAJES_ERROR_TAREA[error.statusCode] : undefined;
      if (!(error instanceof ApiError) || !mensaje) return notifyError(error);
      if (error.statusCode === 403 || error.statusCode === 404 || error.statusCode === 409) {
        queryClient.invalidateQueries({ queryKey: tareasTicketKey(ticketId) });
      }
      toast.error(mensaje);
    },
  });
}

export function useCrearTarea(ticketId: string, opciones: OpcionesMutacionTareas = {}) {
  return useMutacionTarea(
    ticketId,
    (dto: { descripcion: string }) =>
      apiFetch<TareaTicket>(`tickets/${ticketId}/tareas`, { method: "POST", json: dto }),
    "Tarea agregada.",
    opciones,
  );
}

export function useAsignarTecnicoTarea(ticketId: string, opciones: OpcionesMutacionTareas = {}) {
  return useMutacionTarea(
    ticketId,
    ({ tareaId, tecnicoId }: { tareaId: string; tecnicoId: string | null }) =>
      apiFetch<TareaTicket>(`tickets/${ticketId}/tareas/${tareaId}/tecnico`, {
        method: "PATCH",
        json: { tecnicoId },
      }),
    "Técnico de la tarea actualizado.",
    opciones,
  );
}

/**
 * Completar y descompletar mueven el estado del ticket (odd/estado-por-tareas): a EN_PROCESO con la
 * primera, a RESUELTO con la última, de vuelta a EN_PROCESO al descompletar en RESUELTO, y pueden
 * asignarlo a quien completa. Por eso, además de las tareas, quedan viejos el detalle del ticket
 * (`["ticket", id]`, que también cubre su historial) y los listados (`["tickets"]`).
 */
function conEstadoDelTicket(ticketId: string, opciones: OpcionesMutacionTareas): OpcionesMutacionTareas {
  return {
    invalidarTambien: [["ticket", ticketId], ["tickets"], ...(opciones.invalidarTambien ?? [])],
  };
}

export function useCompletarTarea(ticketId: string, opciones: OpcionesMutacionTareas = {}) {
  return useMutacionTarea(
    ticketId,
    (tareaId: string) =>
      apiFetch<TareaTicket>(`tickets/${ticketId}/tareas/${tareaId}/completar`, { method: "POST" }),
    "Tarea completada.",
    conEstadoDelTicket(ticketId, opciones),
  );
}

export function useDescompletarTarea(ticketId: string, opciones: OpcionesMutacionTareas = {}) {
  return useMutacionTarea(
    ticketId,
    (tareaId: string) =>
      apiFetch<TareaTicket>(`tickets/${ticketId}/tareas/${tareaId}/descompletar`, { method: "POST" }),
    "La tarea volvió a pendiente.",
    conEstadoDelTicket(ticketId, opciones),
  );
}

export function useEliminarTarea(ticketId: string, opciones: OpcionesMutacionTareas = {}) {
  return useMutacionTarea(
    ticketId,
    (tareaId: string) => apiFetch<void>(`tickets/${ticketId}/tareas/${tareaId}`, { method: "DELETE" }),
    "Tarea eliminada.",
    opciones,
  );
}
