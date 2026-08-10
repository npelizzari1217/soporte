"use client";

/**
 * use-tipos-componente — CONTAINER hooks para el ABM del catálogo master de
 * tipos de componente (PR5, sdd/tipos-componente-master), exclusivo ROOT.
 * Backend ya existe (PR1-PR4b): `GET /tipos-componente/admin` (lista TODOS,
 * incluye inactivos), `POST /tipos-componente`, `PATCH /tipos-componente/:id`
 * (solo `nombre`, `codigo` inmutable), `POST /tipos-componente/:id/activar`
 * y `POST /tipos-componente/:id/desactivar` (activar/desactivar son POST acá,
 * a diferencia de `/ciclos/:id/activar` que usa PATCH — ver el controller).
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { CrearTipoComponenteDto, RenombrarTipoComponenteDto, TipoComponente } from "../types";

const QUERY_KEY = ["tipos-componente-admin"];

function invalidate(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: QUERY_KEY });
}

export function useTiposComponenteAdmin() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<TipoComponente[]>("tipos-componente/admin"),
    staleTime: 30_000,
  });
}

export function useCrearTipoComponente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CrearTipoComponenteDto) =>
      apiFetch<TipoComponente>("tipos-componente", { method: "POST", json: dto }),
    onSuccess: () => {
      invalidate(queryClient);
      notifySuccess("Tipo de componente creado.");
    },
    onError: notifyError,
  });
}

export function useRenombrarTipoComponente(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: RenombrarTipoComponenteDto) =>
      apiFetch<TipoComponente>(`tipos-componente/${id}`, { method: "PATCH", json: dto }),
    onSuccess: () => {
      invalidate(queryClient);
      notifySuccess("Tipo de componente renombrado.");
    },
    onError: notifyError,
  });
}

export function useActivarTipoComponente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<TipoComponente>(`tipos-componente/${id}/activar`, { method: "POST" }),
    onSuccess: () => {
      invalidate(queryClient);
      notifySuccess("Tipo de componente activado.");
    },
    onError: notifyError,
  });
}

export function useDesactivarTipoComponente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<TipoComponente>(`tipos-componente/${id}/desactivar`, { method: "POST" }),
    onSuccess: () => {
      invalidate(queryClient);
      notifySuccess("Tipo de componente desactivado.");
    },
    onError: notifyError,
  });
}
