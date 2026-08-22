"use client";

/**
 * use-reparacion-compra-mutations — CONTAINER hooks para vincular/desvincular
 * una compra a una reparación (sdd/reparacion-bloqueada-por-compra, WU6).
 *
 * Mismo criterio que `use-reparacion-mutations.ts`: el chip «Bloqueada» y la
 * lista de compras que frenan NO tienen query propia — viajan embebidos en
 * `GET /reparaciones` (`ReparacionListItem.bloqueada`/`comprasQueBloquean`).
 * Por eso ambas mutaciones invalidan `["reparaciones"]` en `onSuccess`: es la
 * única forma de que la fila refleje el vínculo nuevo sin recargar la página.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { VincularCompraDto } from "../types";

/**
 * Vincula una compra a una reparación (`POST /reparaciones/:reparacionId/compras`).
 *
 * El backend acepta el vínculo repetido sin crear una fila duplicada
 * (idempotencia D4 del design) — este hook no necesita lógica propia para
 * evitar el doble clic.
 */
export function useVincularCompra(reparacionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: VincularCompraDto) =>
      apiFetch<void>(`reparaciones/${reparacionId}/compras`, { method: "POST", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reparaciones"] });
      notifySuccess("Compra vinculada.");
    },
    onError: notifyError,
  });
}

/** Desvincula una compra de una reparación (`DELETE /reparaciones/:reparacionId/compras/:compraId`, hard delete). */
export function useDesvincularCompra(reparacionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (compraId: string) =>
      apiFetch<void>(`reparaciones/${reparacionId}/compras/${compraId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reparaciones"] });
      notifySuccess("Compra desvinculada.");
    },
    onError: notifyError,
  });
}
