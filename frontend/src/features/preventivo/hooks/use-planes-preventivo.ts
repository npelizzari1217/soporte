"use client";

/**
 * use-planes-preventivo — CONTAINER hooks de LECTURA para `GET /preventivo/planes`
 * y `GET /preventivo/planes/:id/generaciones` (WU-7.1). El backend NO expone
 * `GET /preventivo/planes/:id` (WU-4, `PreventivoController`) — el detalle de
 * un plan puntual se deriva del listado ya cacheado, no de un fetch aparte.
 */
import { useQuery, useQueries, type UseQueryResult } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { PlanPreventivo, PreventivoGeneracion } from "../types";

/**
 * `GET /preventivo/planes` — el listado completo de planes del tenant.
 *
 * @returns La query de TanStack Query, con `data` como `PlanPreventivo[]`.
 */
export function usePlanesPreventivo(): UseQueryResult<PlanPreventivo[], Error> {
  return useQuery({
    queryKey: ["preventivo", "planes"],
    queryFn: () => apiFetch<PlanPreventivo[]>("preventivo/planes"),
  });
}

/** Resultado de `usePlanPreventivo` — igual a `usePlanesPreventivo` pero con `data` acotado a un solo plan. */
export interface UsePlanPreventivoResult extends Omit<UseQueryResult<PlanPreventivo[], Error>, "data"> {
  /** El plan con este id, o `undefined` mientras carga, si falló, o si no existe. */
  data: PlanPreventivo | undefined;
  /**
   * `true` únicamente cuando el listado cargó BIEN pero el id pedido no está
   * en él (plan borrado, URL vieja guardada en favoritos, o fuera del scope
   * del actor) — distinto de una carga que falló (`isError`). Ver hallazgo de
   * revisión: sin esto, un 404 se mostraba como "no se pudo cargar" con un
   * botón de reintento que nunca iba a encontrar el plan.
   */
  notFound: boolean;
}

/**
 * Deriva un plan puntual del listado cacheado (el backend NO expone
 * `GET /preventivo/planes/:id`, ver `types.ts`).
 *
 * @param id - Id del plan buscado.
 * @returns El estado de la query del listado, con `data` acotado al plan
 * pedido y un flag `notFound` para distinguir "no existe" de "falló la carga".
 */
export function usePlanPreventivo(id: string): UsePlanPreventivoResult {
  const planesQuery = usePlanesPreventivo();
  const data = planesQuery.data?.find((plan) => plan.id === id);
  return {
    ...planesQuery,
    data,
    notFound: planesQuery.isSuccess && !data,
  };
}

/**
 * `GET /preventivo/planes/:id/generaciones` — historial de auditoría de un plan.
 *
 * @param planId - Id del plan.
 * @returns La query de TanStack Query, con `data` como `PreventivoGeneracion[]`.
 */
export function useGeneracionesPlan(planId: string): UseQueryResult<PreventivoGeneracion[], Error> {
  return useQuery({
    queryKey: ["preventivo", "planes", planId, "generaciones"],
    queryFn: () => apiFetch<PreventivoGeneracion[]>(`preventivo/planes/${planId}/generaciones`),
    enabled: !!planId,
  });
}

/**
 * Trae las generaciones de VARIOS planes en paralelo (una query por plan,
 * misma queryKey que `useGeneracionesPlan` — comparten cache al navegar al
 * detalle). Alimenta la columna "última generación" del listado: un plan sin
 * ninguna fila es un HUECO visible (huérfano), no un error.
 *
 * N+1 sin guarda deliberado: a la escala esperada de planes de mantenimiento
 * (decenas, no miles) el costo de un request por plan es aceptable y evita
 * depender de un endpoint bulk que el backend no expone. Si el catálogo de
 * planes crece a cientos, esto necesita revisarse (endpoint bulk o
 * paginación) — no agregar más planes a esta lista sin volver a medir.
 *
 * @param planIds - Ids de los planes a consultar.
 * @returns Un array de queries de TanStack Query, una por `planId`, en el mismo orden.
 */
export function useGeneracionesDeVariosPlanes(
  planIds: string[],
): UseQueryResult<PreventivoGeneracion[], Error>[] {
  return useQueries({
    queries: planIds.map((planId) => ({
      queryKey: ["preventivo", "planes", planId, "generaciones"] as const,
      queryFn: () => apiFetch<PreventivoGeneracion[]>(`preventivo/planes/${planId}/generaciones`),
    })),
  });
}

/**
 * Última generación de un plan por `fechaProgramada`, o `undefined` si nunca
 * generó. La comparación es lexicográfica (`>` de strings) — CORRECTA acá
 * porque `fechaProgramada` es SIEMPRE un ISO 8601 con offset fijo generado
 * por `Date.toISOString()` en el backend (`toPreventivoGeneracionResponseDto`,
 * `preventivo.dto.ts`), nunca texto de formato libre. Si esa garantía cambia
 * (otro formato, u otro origen de la fecha), esta comparación deja de ser
 * válida y hay que parsear a `Date` antes de comparar.
 *
 * @param generaciones - Generaciones del plan, en cualquier orden.
 * @returns La generación más reciente, o `undefined` si la lista está vacía o ausente.
 */
export function ultimaGeneracion(generaciones: PreventivoGeneracion[] | undefined): PreventivoGeneracion | undefined {
  if (!generaciones || generaciones.length === 0) return undefined;
  return generaciones.reduce((ultima, actual) =>
    actual.fechaProgramada > ultima.fechaProgramada ? actual : ultima,
  );
}
