"use client";

/**
 * use-ticket-mutations — CONTAINER hooks para las mutaciones de un ticket
 * (R-M1 / T1.9-T1.13). Invalidación tras mutar (ADR-2): comentar/
 * transicionar/asignar/adjuntar invalidan detalle + timeline + lista —
 * cualquiera de los tres puede haber cambiado (ej. transicionar cambia el
 * `estadoId` que la lista también muestra). Crear solo invalida la lista
 * (no existe detalle/timeline previos del ticket nuevo). Editar invalida
 * detalle + lista (no toca timeline: no genera una operación de timeline).
 *
 * Errores → toast sonner vía `notifyError` (ADR-8), consistente en las 6
 * mutaciones — el caller no repite el manejo de error.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { ArchivoAdjunto, ComentarioDto, CrearTicketDto, EditarTicketDto, Ticket } from "../types";

function invalidateTicketAndList(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
  { timeline = true }: { timeline?: boolean } = {},
) {
  queryClient.invalidateQueries({ queryKey: ["ticket", id] });
  if (timeline) {
    queryClient.invalidateQueries({ queryKey: ["ticket", id, "timeline"] });
  }
  queryClient.invalidateQueries({ queryKey: ["tickets"] });
}

export function useCrearTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CrearTicketDto) => apiFetch<Ticket>("tickets", { method: "POST", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      notifySuccess("Ticket creado.");
    },
    onError: notifyError,
  });
}

export function useEditarTicket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: EditarTicketDto) => apiFetch<Ticket>(`tickets/${id}`, { method: "PATCH", json: dto }),
    onSuccess: () => {
      invalidateTicketAndList(queryClient, id, { timeline: false });
      notifySuccess("Ticket actualizado.");
    },
    onError: notifyError,
  });
}

export function useTransicionarEstado(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: { nuevoEstadoCodigo: string }) =>
      apiFetch<Ticket>(`tickets/${id}/estado`, { method: "PATCH", json: dto }),
    onSuccess: () => {
      invalidateTicketAndList(queryClient, id);
      notifySuccess("Estado actualizado.");
    },
    onError: notifyError,
  });
}

export function useAsignarTicket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: { asignadoId: string }) =>
      apiFetch<Ticket>(`tickets/${id}/asignar`, { method: "PATCH", json: dto }),
    onSuccess: () => {
      invalidateTicketAndList(queryClient, id);
      notifySuccess("Ticket asignado.");
    },
    onError: notifyError,
  });
}

export function useComentar(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: ComentarioDto) =>
      apiFetch<{ id: string }>(`tickets/${id}/comentarios`, { method: "POST", json: dto }),
    onSuccess: () => {
      invalidateTicketAndList(queryClient, id);
      notifySuccess("Comentario agregado.");
    },
    onError: notifyError,
  });
}

export function useSubirAdjunto(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.set("archivo", file);
      return apiFetch<ArchivoAdjunto>(`tickets/${id}/adjuntos`, { method: "POST", body: formData });
    },
    onSuccess: () => {
      invalidateTicketAndList(queryClient, id);
      notifySuccess("Adjunto subido.");
    },
    onError: notifyError,
  });
}
