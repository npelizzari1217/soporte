"use client";

/**
 * useModelosEquipo — CONTAINER hook para `GET /modelos-equipo` (catálogo).
 *
 * Archivo propio por el mismo criterio que `use-unidades-medida.ts`: catálogo
 * distinto, endpoint distinto, `queryKey` distinta.
 *
 * `queryKey` FLAT, sin segmento de tenant (ADR-5): en este frontend el
 * aislamiento de caché por inquilino no vive en la `queryKey`, vive en el
 * `QueryClient` por instancia de provider (`query-provider.tsx:19`) y en la
 * invalidación global de `TenantSwitcher` (`tenant-switcher.tsx:62`). Meterle
 * un segmento acá la volvería la única distinta de sus cinco hermanas sin
 * cerrar ningún agujero.
 *
 * SIN gate de permiso: la lectura es abierta a cualquier autenticado — la
 * consume también el selector de modelo de los diálogos de equipo (WU-3), que
 * no requiere `esAdminCliente`.
 *
 * Devuelve los modelos VIGENTES, habilitados y deshabilitados — no hay borrado
 * duro para este catálogo (`ModeloEquipoEntity.desactivar()`).
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { ModeloEquipo } from "../types";

/** El catálogo cambia poco (ABM de administrador) — `staleTime` más largo que el default. */
const MODELOS_EQUIPO_STALE_TIME = 5 * 60_000;

/** @returns La query del catálogo de modelos de equipo del inquilino. */
export function useModelosEquipo() {
  return useQuery({
    queryKey: ["modelos-equipo"],
    queryFn: () => apiFetch<ModeloEquipo[]>("modelos-equipo"),
    staleTime: MODELOS_EQUIPO_STALE_TIME,
  });
}
