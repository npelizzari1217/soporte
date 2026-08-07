"use client";

/**
 * use-catalogos — CONTAINER hooks para los catálogos de lectura (G1/G4,
 * `sdd/beta-frontend/design` ADR-5): tipos de ticket, prioridades, estados
 * (fijo) y tipos de operación (fijo, para mapear el timeline). Sin gate de
 * permiso — cualquier usuario autenticado del tenant puede leerlos
 * (alimentan selects/filtros/labels en toda la UI).
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { Estado, Prioridad, TipoOperacion, TipoTicket } from "../types";

/** Catálogos activos cambian con poca frecuencia (admin CRUD, B4) — staleTime más largo que el default. */
const CATALOGO_STALE_TIME = 5 * 60_000;

export function useTiposTicket() {
  return useQuery({
    queryKey: ["catalogos", "tipos-ticket"],
    queryFn: () => apiFetch<TipoTicket[]>("catalogos/tipos-ticket"),
    staleTime: CATALOGO_STALE_TIME,
  });
}

export function usePrioridades() {
  return useQuery({
    queryKey: ["catalogos", "prioridades"],
    queryFn: () => apiFetch<Prioridad[]>("catalogos/prioridades"),
    staleTime: CATALOGO_STALE_TIME,
  });
}

export function useEstados() {
  return useQuery({
    queryKey: ["catalogos", "estados"],
    queryFn: () => apiFetch<Estado[]>("catalogos/estados"),
    staleTime: CATALOGO_STALE_TIME,
  });
}

export function useTiposOperacion() {
  return useQuery({
    queryKey: ["catalogos", "tipo-operacion"],
    queryFn: () => apiFetch<TipoOperacion[]>("catalogos/tipo-operacion"),
    staleTime: CATALOGO_STALE_TIME,
  });
}
