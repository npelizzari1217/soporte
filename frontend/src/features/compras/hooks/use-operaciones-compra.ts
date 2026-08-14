"use client";

/**
 * useOperacionesCompra — CONTAINER hook para `GET /compras/:id/operaciones`
 * (bitácora completa de una compra, ordenada `created_at ASC` por el
 * backend — §4.10, S35-S37, H3 del design). `use-compras.ts` (PR-23)
 * declaró explícitamente que este hook queda fuera de su alcance
 * ("PR-23 NO creó el hook de bitácora"); se agrega acá en PR-25 siguiendo
 * EXACTAMENTE el mismo patrón que `useCompra`.
 *
 * Sin gate de permiso en el backend (`ComprasController.listarOperaciones()`
 * no declara `@RequirePermissions` — decisión del maintainer,
 * `sdd/redisenio-modulo-compras/rbac-consultas`: las consultas se gatean
 * SOLO por módulo) — cualquier usuario autenticado del tenant con el módulo
 * COMPRAS habilitado puede consultar.
 *
 * Manejo de error defensivo: mismo criterio que `useCompra` — `apiFetch`
 * normaliza fallos de red/HTTP a `ApiError`/`SessionExpiredError`; TanStack
 * Query los expone vía `error`/`isError` de este hook. El consumidor
 * (`CompraBitacoraSection`) decide cómo mostrarlos, sin try/catch adicional
 * acá (mismo criterio que el resto de los hooks de consulta del repo).
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { OperacionCompra } from "../types";

/** Bitácora completa de una compra (H3 del design). `enabled: !!compraId` evita disparar con id vacío durante el primer render. */
export function useOperacionesCompra(compraId: string) {
  return useQuery({
    queryKey: ["compra-operaciones", compraId],
    queryFn: () => apiFetch<OperacionCompra[]>(`compras/${compraId}/operaciones`),
    enabled: !!compraId,
  });
}
