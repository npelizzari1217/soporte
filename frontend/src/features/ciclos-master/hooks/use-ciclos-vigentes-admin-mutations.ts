"use client";

/**
 * use-ciclos-vigentes-admin-mutations — CONTAINER hooks para el ABM del
 * catálogo master de ciclos (sdd/ciclos-abm-root), exclusivo ROOT.
 *
 * Invalida TANTO `["ciclos-vigentes-admin"]` (esta tabla) COMO
 * `["ciclos-vigentes"]` (`features/ciclos`, selector de adopción del
 * tenant) — el catálogo es el mismo recurso backend, así que una edición o
 * baja acá debe reflejarse también ahí sin esperar el `staleTime`.
 */
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { CicloVigente, CreateCicloVigenteDto, EditarCicloVigenteDto } from "../types";

function invalidateCiclosVigentes(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["ciclos-vigentes-admin"] });
  queryClient.invalidateQueries({ queryKey: ["ciclos-vigentes"] });
}

export function useCrearCicloVigente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateCicloVigenteDto) =>
      apiFetch<CicloVigente>("ciclos-vigentes", { method: "POST", json: dto }),
    onSuccess: () => {
      invalidateCiclosVigentes(queryClient);
      notifySuccess("Ciclo creado.");
    },
    onError: notifyError,
  });
}

export function useEditarCicloVigente(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: EditarCicloVigenteDto) =>
      apiFetch<CicloVigente>(`ciclos-vigentes/${id}`, { method: "PATCH", json: dto }),
    onSuccess: () => {
      invalidateCiclosVigentes(queryClient);
      notifySuccess("Ciclo actualizado.");
    },
    onError: notifyError,
  });
}

export function useEliminarCicloVigente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`ciclos-vigentes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateCiclosVigentes(queryClient);
      notifySuccess("Ciclo eliminado.");
    },
    onError: notifyError,
  });
}
