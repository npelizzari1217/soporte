"use client";

/**
 * useResolverQr — `GET /soporte/qr?c=<slug>&e=<token>` (sdd/formulario-publico-qr, WU-17/18).
 *
 * Camino D3: un usuario con sesión escaneó el QR de un equipo. El backend compara el slug con el
 * de la sesión (404 si es de otra organización, sin revelar nada) y resuelve el token en el
 * tenant de la sesión: `{ equipo: {id, nombre} | null }`. Requiere `TICKETS:ALTAS` (403 si falta).
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { ApiError } from "@/shared/api/types";

export interface ResolucionQr {
  equipo: { id: string; nombre: string } | null;
}

export function useResolverQr(slug: string | null, tokenQr: string | null): UseQueryResult<ResolucionQr, ApiError> {
  const params = new URLSearchParams();
  if (slug) params.set("c", slug);
  if (tokenQr) params.set("e", tokenQr);
  return useQuery<ResolucionQr, ApiError>({
    queryKey: ["soporte-qr", slug, tokenQr],
    queryFn: () => apiFetch<ResolucionQr>(`soporte/qr?${params.toString()}`),
    // Sin `c` no hay a quién preguntar: el backend respondería 404 y se leería como "otra organización".
    // Sin `e` sí se consulta: es el camino legítimo "formulario sin equipo" (`equipo: null`).
    enabled: Boolean(slug),
    retry: false,
    // El token del QR es de uso repetible pero el resultado no cambia mientras el landing esté abierto.
    staleTime: Infinity,
  });
}
