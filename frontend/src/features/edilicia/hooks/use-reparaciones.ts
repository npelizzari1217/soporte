"use client";

/**
 * use-reparaciones — CONTAINER hook para `GET /reparaciones` (T5.8). Lista
 * PLANA sin paginación server (mismo criterio que `useCompras`, B5).
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { ReparacionListItem } from "../types";

export function useReparaciones() {
  return useQuery({
    queryKey: ["reparaciones"],
    queryFn: () => apiFetch<ReparacionListItem[]>("reparaciones"),
  });
}
