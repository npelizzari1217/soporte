"use client";

/**
 * useDescargarPdfCompra — descarga la "Solicitud de compra" en PDF vía
 * `GET /compras/:id/pdf` (odd/tasks/compra-export-secciones-y-pdf.md, S8).
 * Mismo mecanismo que el PDF del ticket: blob + nombre del Content-Disposition.
 */
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { apiFetchBlob } from "@/shared/api/client";
import { dispararDescarga, nombreDesdeContentDisposition } from "@/shared/lib/descarga";
import { notifyError } from "@/shared/lib/toast";

export interface UseDescargarPdfCompraParams {
  compraId: string;
  /** Número de la compra, para el nombre por defecto si el header no llega. */
  numero: string;
}

/**
 * @param params id y número de la compra.
 * @returns la mutación que baja el PDF; un error se muestra como toast.
 */
export function useDescargarPdfCompra({
  compraId,
  numero,
}: UseDescargarPdfCompraParams): UseMutationResult<void, unknown, void> {
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const archivo = await apiFetchBlob(`compras/${encodeURIComponent(compraId)}/pdf`);
      dispararDescarga(
        archivo.blob,
        nombreDesdeContentDisposition(archivo.contentDisposition) ??
          `solicitud-de-compra-${numero}.pdf`,
      );
    },
    onError: notifyError,
  });
}
