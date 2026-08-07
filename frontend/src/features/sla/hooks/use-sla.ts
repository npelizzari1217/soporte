"use client";

/**
 * use-sla — CONTAINER hook para `GET /sla/config` (S1). A diferencia de
 * `GET /catalogos/*`, esta ruta SÍ está gateada por `catalogo:gestionar`
 * (config administrativa, no catálogo de referencia público del tenant —
 * ver `SlaConfigController`) — un 403 se propaga como `ApiError` normal,
 * lo maneja el caller (`SlaAdminView`) vía `ErrorState`.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { SlaConfig } from "../types";

export function useSlaConfig() {
  return useQuery({
    queryKey: ["sla", "config"],
    queryFn: () => apiFetch<SlaConfig[]>("sla/config"),
    staleTime: 60_000,
  });
}
