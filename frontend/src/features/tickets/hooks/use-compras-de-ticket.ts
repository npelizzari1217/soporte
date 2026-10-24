"use client";

/**
 * use-compras-de-ticket — CONTAINER hooks de las compras vinculadas a un ticket de cualquier tipo
 * (odd/ticket-unificado, S1, S4): `GET`, `POST` y `DELETE` sobre `/tickets/:ticketId/compras`.
 *
 * Las tres rutas exigen la celda `COMPRAS:LECTURA` (L19, L22); vincular y desvincular, además,
 * `MODIFICACION` sobre el tipo del ticket. Quien monta estos hooks decide si se piden: sin
 * `COMPRAS:LECTURA`, `GET` respondería 403.
 *
 * Las mutaciones invalidan `["ticket", id]`, que incluye esta lista y el detalle (su `bloqueada`
 * cambia con el vínculo), y `["reparaciones"]`: el chip «Bloqueada» y `comprasQueBloquean` de la
 * grilla de Edilicia viajan embebidos en ese listado, que no tiene otra forma de enterarse del
 * vínculo nuevo.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { CompraDeTicket } from "../types";

/**
 * Query key de las compras de UN ticket; cuelga de `["ticket", id]` para que lo que invalida el
 * detalle también la refresque.
 *
 * @param ticketId Id del ticket.
 * @returns La key.
 */
export function comprasDeTicketQueryKey(ticketId: string): readonly [string, string, string] {
  return ["ticket", ticketId, "compras"] as const;
}

/**
 * Las compras vinculadas al ticket, activas o no, por número.
 *
 * @param ticketId Id del ticket.
 * @param enabled `false` mientras no corresponde pedirlas (sin `COMPRAS:LECTURA`, o con el
 *   diálogo cerrado).
 * @returns La query de react-query.
 */
export function useComprasDeTicket(ticketId: string, enabled = true) {
  return useQuery({
    queryKey: comprasDeTicketQueryKey(ticketId),
    queryFn: () => apiFetch<CompraDeTicket[]>(`tickets/${ticketId}/compras`),
    enabled: enabled && !!ticketId,
  });
}

function useInvalidarCompras(ticketId: string): () => void {
  const queryClient = useQueryClient();
  return () => {
    // Prefijo del detalle: alcanza a esta lista (`comprasDeTicketQueryKey`) y a `bloqueada`.
    queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
    queryClient.invalidateQueries({ queryKey: ["reparaciones"] });
  };
}

/**
 * Vincula una compra al ticket (`POST /tickets/:ticketId/compras`). El backend acepta el vínculo
 * repetido sin duplicarlo, así que un doble clic no necesita lógica propia.
 *
 * @param ticketId Id del ticket.
 * @returns La mutación; recibe el id de la compra.
 */
export function useVincularCompraATicket(ticketId: string) {
  const invalidar = useInvalidarCompras(ticketId);
  return useMutation({
    mutationFn: (compraId: string) =>
      apiFetch<void>(`tickets/${ticketId}/compras`, { method: "POST", json: { compraId } }),
    onSuccess: () => {
      invalidar();
      notifySuccess("Compra vinculada.");
    },
    onError: notifyError,
  });
}

/**
 * Desvincula una compra del ticket (`DELETE /tickets/:ticketId/compras/:compraId`, borrado real).
 *
 * @param ticketId Id del ticket.
 * @returns La mutación; recibe el id de la compra.
 */
export function useDesvincularCompraDeTicket(ticketId: string) {
  const invalidar = useInvalidarCompras(ticketId);
  return useMutation({
    mutationFn: (compraId: string) =>
      apiFetch<void>(`tickets/${ticketId}/compras/${compraId}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidar();
      notifySuccess("Compra desvinculada.");
    },
    onError: notifyError,
  });
}
