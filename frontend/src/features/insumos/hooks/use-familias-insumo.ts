"use client";

/**
 * useFamiliasInsumo — CONTAINER hook para `GET /familias-insumo` (catálogo).
 *
 * Vive en su propio archivo, y no junto a `useUnidadesMedida`, por el mismo
 * criterio que separa `use-insumos.ts`: es un catálogo distinto, con su
 * endpoint y su `queryKey`, y el futuro ABM de familias tiene que poder
 * importarlo sin arrastrar el módulo del otro.
 *
 * SIN gate de permiso: el endpoint es lectura abierta para cualquier usuario
 * autenticado del inquilino, igual que `GET /insumos`.
 *
 * Devuelve las familias VIGENTES, habilitadas y deshabilitadas — la baja lógica
 * es lo único que excluye. Por eso la AUSENCIA de un id en esta lista, una vez
 * resuelta, sí prueba que la familia fue eliminada del catálogo.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { FamiliaInsumo } from "../types";

/** El catálogo cambia poco (ABM de administrador) — `staleTime` más largo que el default. */
const FAMILIAS_INSUMO_STALE_TIME = 5 * 60_000;

/** @returns La query del catálogo de familias de insumo del inquilino. */
export function useFamiliasInsumo() {
  return useQuery({
    queryKey: ["familias-insumo"],
    queryFn: () => apiFetch<FamiliaInsumo[]>("familias-insumo"),
    staleTime: FAMILIAS_INSUMO_STALE_TIME,
  });
}
