"use client";

/**
 * use-certificados — CONTAINER hooks de los certificados de avance de un ticket EXTERNA
 * (odd/edilicia-obra-externa, T4):
 *
 *   GET  /tickets/:id/certificados                         → lista (quien ve el ticket)
 *   POST /tickets/:id/certificados                         → emitir (`CERTIFICAR`)
 *   POST /tickets/:id/certificados/:certificadoId/anular   → anular con motivo (`CERTIFICAR`)
 *
 * Las mutaciones invalidan `["ticket", id]`: cuelgan de ahí esta lista, las tareas (una tarea
 * certificada deja de poder repesarse o borrarse) y el historial, que registra la emisión y la
 * anulación. Los rechazos del backend ya vienen en lenguaje del usuario: `notifyError` los muestra.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiFetchBlob } from "@/shared/api/client";
import { dispararDescarga, nombreDesdeContentDisposition } from "@/shared/lib/descarga";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { CertificadoAvance } from "../types";

/**
 * @param ticketId Id del ticket.
 * @returns La query key de sus certificados, bajo `["ticket", id]`.
 */
export function certificadosQueryKey(ticketId: string): readonly [string, string, string] {
  return ["ticket", ticketId, "certificados"] as const;
}

/**
 * Certificados del ticket, vigentes y anulados, por número.
 *
 * @param ticketId Id del ticket.
 * @param enabled `false` si el ticket no es EXTERNA: no hay nada que pedir.
 * @returns La query de react-query.
 */
export function useCertificados(ticketId: string, enabled = true) {
  return useQuery({
    queryKey: certificadosQueryKey(ticketId),
    queryFn: () => apiFetch<CertificadoAvance[]>(`tickets/${ticketId}/certificados`),
    enabled: enabled && !!ticketId,
  });
}

function useInvalidarTicket(ticketId: string): () => void {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
  };
}

/**
 * Emite un certificado con las tareas elegidas.
 *
 * @param ticketId Id del ticket.
 * @returns La mutación; recibe los ids de las tareas.
 */
export function useEmitirCertificado(ticketId: string) {
  const invalidar = useInvalidarTicket(ticketId);
  return useMutation({
    mutationFn: (tareaIds: string[]) =>
      apiFetch<CertificadoAvance>(`tickets/${ticketId}/certificados`, { method: "POST", json: { tareaIds } }),
    onSuccess: (certificado) => {
      invalidar();
      notifySuccess(`Certificado N.º ${certificado.numero} emitido (${certificado.porcentaje} %).`);
    },
    onError: notifyError,
  });
}

/**
 * Anula un certificado con su motivo; sus tareas quedan libres.
 *
 * @param ticketId Id del ticket.
 * @returns La mutación; recibe el certificado y el motivo.
 */
export function useAnularCertificado(ticketId: string) {
  const invalidar = useInvalidarTicket(ticketId);
  return useMutation({
    mutationFn: ({ certificadoId, motivo }: { certificadoId: string; motivo: string }) =>
      apiFetch<CertificadoAvance>(`tickets/${ticketId}/certificados/${certificadoId}/anular`, {
        method: "POST",
        json: { motivo },
      }),
    onSuccess: (certificado) => {
      invalidar();
      notifySuccess(`Certificado N.º ${certificado.numero} anulado.`);
    },
    onError: notifyError,
  });
}

/**
 * Descarga el PDF de un certificado (`GET .../certificados/:certificadoId/pdf`, S7): la salida hacia
 * administración. Se modela como mutación porque lo dispara el usuario y no se cachea, igual que la
 * ficha PDF del ticket.
 *
 * @param ticketId Id del ticket.
 * @returns La mutación; recibe el certificado.
 */
export function useDescargarPdfCertificado(ticketId: string) {
  return useMutation({
    mutationFn: async (certificado: { id: string; numero: number }): Promise<void> => {
      const archivo = await apiFetchBlob(`tickets/${ticketId}/certificados/${certificado.id}/pdf`);
      dispararDescarga(
        archivo.blob,
        nombreDesdeContentDisposition(archivo.contentDisposition) ?? `certificado-${certificado.numero}.pdf`,
      );
    },
    onError: notifyError,
  });
}

