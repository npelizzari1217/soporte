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
 *
 * `esRepuesto` (WU-2, sdd/repuestos-seccion) filtra por la familia del
 * insumo: `false` trae los consumibles (`InsumosListView`), `true` los
 * repuestos de equipo (`RepuestosListView`). El filtro corre en el SERVIDOR
 * (`ListarInsumosUseCase`) — este hook solo arma el query param.
 *
 * **`esRepuesto` AUSENTE trae TODOS**, repuestos y consumibles por igual: es
 * el comportamiento previo a este WU, y lo siguen necesitando dos
 * consumidores que este WU no toca y que NO distinguen la familia —
 * `InsumoDetailView` (busca un insumo por id sin importar de qué familia es)
 * y los selectores de ítem de una compra (`item-create-dialog`,
 * `item-edit-dialog`: se puede comprar cualquier insumo). Las dos pantallas
 * de sección nunca dependen de ese default: siempre pasan `false` o `true`
 * explícito.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { buildQueryString } from "@/shared/lib/build-query-string";
import type { Insumo } from "../types";

/** El catálogo cambia poco (ABM de administrador) — `staleTime` más largo que el default. */
const INSUMOS_STALE_TIME = 5 * 60_000;

/**
 * @param esRepuesto Filtro por familia; ausente trae TODOS los insumos.
 * @returns La query del catálogo de insumos del inquilino.
 */
export function useInsumos(esRepuesto?: boolean) {
  const qs = buildQueryString({ esRepuesto });
  return useQuery({
    queryKey: ["insumos", esRepuesto ?? null],
    queryFn: () => apiFetch<Insumo[]>(`insumos${qs ? `?${qs}` : ""}`),
    staleTime: INSUMOS_STALE_TIME,
  });
}
