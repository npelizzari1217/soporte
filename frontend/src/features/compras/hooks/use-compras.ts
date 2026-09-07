"use client";

/**
 * use-compras — CONTAINER hooks para `GET /compras` (listado paginado,
 * S32-S34, NUNCA incluye `items`) y `GET /compras/:id` (detalle CON ítems,
 * H3 del design). Mismo patrón que `features/equipos/hooks/use-equipos.ts`:
 * ambas consultas conviven en un solo archivo. Las dos rutas SÍ exigen
 * `COMPRAS:LECTURA` en el backend (`compras.controller.ts`: `@RequiereAcciones`
 * en el `@Get()` y en el `@Get(':id')`, con `AccionesGuard` a nivel de clase),
 * así que un 403 acá es la respuesta esperada y no una falla.
 *
 * Manejo de error defensivo: `apiFetch` (`shared/api/client.ts`) normaliza
 * fallos de red y HTTP a `ApiError`/`SessionExpiredError`; TanStack Query
 * los expone vía `error`/`isError` de cada hook — no hace falta un
 * try/catch adicional acá (mismo criterio que el resto de los hooks de
 * consulta del repo).
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { buildQueryString } from "@/shared/lib/build-query-string";
import type { CompraDetalle, ComprasFiltros, ListarComprasResponse } from "../types";

/**
 * Mapea `ComprasFiltros` a query string real de `GET /compras` — omite claves
 * undefined (nunca "clave=undefined").
 *
 * Recorre las claves de forma genérica, así que `estado` (WU-25) viaja como
 * `?estado=ACTIVAS` sin caso especial: el contrato del backend usa exactamente
 * los mismos nombres que `ComprasFiltros`.
 */
export function buildComprasQueryString(filtros: ComprasFiltros): string {
  return buildQueryString({ ...filtros });
}

/** Listado paginado de compras del tenant activo (§4.9, S32-S34). */
export function useCompras(filtros: ComprasFiltros = {}) {
  const qs = buildComprasQueryString(filtros);
  return useQuery({
    queryKey: ["compras", filtros],
    queryFn: () => apiFetch<ListarComprasResponse>(`compras${qs ? `?${qs}` : ""}`),
  });
}

/** Detalle de una compra CON sus ítems (H3 del design). */
export function useCompra(id: string) {
  return useQuery({
    queryKey: ["compra", id],
    queryFn: () => apiFetch<CompraDetalle>(`compras/${id}`),
    enabled: !!id,
  });
}
