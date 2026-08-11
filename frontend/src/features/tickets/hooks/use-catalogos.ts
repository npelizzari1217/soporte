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

/**
 * Tipos de ticket del catálogo. Con `modulo` filtra al módulo funcional
 * (B2: separación estricta) — el backend acepta `?modulo=COMPRAS`. Sin
 * `modulo` devuelve todos (comportamiento previo, usado por listas/labels
 * que mapean `tipoId → nombre` sin importar el módulo).
 */
export function useTiposTicket(modulo?: string) {
  return useQuery({
    queryKey: ["catalogos", "tipos-ticket", modulo ?? "all"],
    queryFn: () =>
      apiFetch<TipoTicket[]>(
        modulo ? `catalogos/tipos-ticket?modulo=${encodeURIComponent(modulo)}` : "catalogos/tipos-ticket",
      ),
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
