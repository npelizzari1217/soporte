"use client";

/**
 * use-routing — CONTAINER hook para `GET /routing` (item 5 backend-gaps —
 * cierra el gap "opera a ciegas" documentado en B4: antes `RoutingAdminView`
 * solo podía asociar/desasociar sin ver el estado actual).
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { RoutingAsociacion } from "../types";

export function useRouting() {
  return useQuery({
    queryKey: ["routing"],
    queryFn: () => apiFetch<RoutingAsociacion[]>("routing"),
  });
}
