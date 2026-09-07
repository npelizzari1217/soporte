"use client";

/**
 * useInsumos — CONTAINER hook para `GET /insumos` (catálogo).
 *
 * SIN gate de permiso: el endpoint es lectura abierta para cualquier usuario
 * autenticado del inquilino, porque lo necesita para elegir un insumo desde
 * otras pantallas. Mismo criterio que `features/sectores/hooks/use-sectores.ts`.
 *
 * Devuelve los insumos VIGENTES, habilitados y deshabilitados. Los
 * deshabilitados llegan a propósito: un ítem de compra puede apuntar a uno, y
 * filtrarlos acá dejaría al `<select>` sin la opción de un valor que el
 * servidor sí acepta.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { Insumo } from "../types";

/** El catálogo cambia poco (ABM de administrador) — `staleTime` más largo que el default. */
const INSUMOS_STALE_TIME = 5 * 60_000;

/** @returns La query del catálogo de insumos del inquilino. */
export function useInsumos() {
  return useQuery({
    queryKey: ["insumos"],
    queryFn: () => apiFetch<Insumo[]>("insumos"),
    staleTime: INSUMOS_STALE_TIME,
  });
}
