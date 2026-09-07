"use client";

/**
 * useUnidadesMedida — CONTAINER hook para `GET /unidades-medida` (catálogo).
 *
 * Archivo propio por el mismo criterio que `use-familias-insumo.ts`: catálogo
 * distinto, endpoint distinto, `queryKey` distinta.
 *
 * SIN gate de permiso: el endpoint es lectura abierta para cualquier usuario
 * autenticado del inquilino, igual que `GET /insumos`.
 *
 * Devuelve las unidades VIGENTES, habilitadas y deshabilitadas — la baja lógica
 * es lo único que excluye.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { UnidadMedida } from "../types";

/** El catálogo cambia poco (ABM de administrador) — `staleTime` más largo que el default. */
const UNIDADES_MEDIDA_STALE_TIME = 5 * 60_000;

/** @returns La query del catálogo de unidades de medida del inquilino. */
export function useUnidadesMedida() {
  return useQuery({
    queryKey: ["unidades-medida"],
    queryFn: () => apiFetch<UnidadMedida[]>("unidades-medida"),
    staleTime: UNIDADES_MEDIDA_STALE_TIME,
  });
}
