"use client";

/**
 * useDescargarPdfTicket — CONTAINER hook de `GET /tickets/:id/pdf` (ficha PDF
 * del ticket). Mismo criterio que `useExportarCsv`: es un GET que se modela
 * con `useMutation` porque lo dispara el usuario, tiene efecto de lado (le
 * entrega un archivo) y no se cachea.
 *
 * Reusa `apiFetchBlob` (fetch autenticado + refresh de sesión, bytes sin
 * decodificar como texto) y `dispararDescarga`. El nombre sale del
 * `Content-Disposition` del backend; si no viniera legible, cae a
 * `ticket-<numero>.pdf`.
 *
 * Errores → `notifyError` (ADR-8): un fallo silencioso haría creer al usuario
 * que descargó.
 */
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { apiFetchBlob } from "@/shared/api/client";
import { dispararDescarga, nombreDesdeContentDisposition } from "@/shared/lib/descarga";
import { notifyError } from "@/shared/lib/toast";

export interface UseDescargarPdfTicketParams {
  ticketId: string;
  /** Número legible del ticket, solo para el nombre de archivo de respaldo. */
  numero: string;
}

export function useDescargarPdfTicket({
  ticketId,
  numero,
}: UseDescargarPdfTicketParams): UseMutationResult<void, unknown, void> {
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const archivo = await apiFetchBlob(`tickets/${ticketId}/pdf`);
      dispararDescarga(
        archivo.blob,
        nombreDesdeContentDisposition(archivo.contentDisposition) ?? `ticket-${numero}.pdf`,
      );
    },
    onError: notifyError,
  });
}
