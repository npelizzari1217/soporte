"use client";

/**
 * use-ubicaciones — CONTAINER hook para `GET /ubicaciones` (T5.7). Sin gate
 * de permiso (el backend no lo exige) — alimenta el selector de ubicación
 * del form de crear reparación además de la tabla de gestión.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { Ubicacion } from "../types";

export function useUbicaciones() {
  return useQuery({
    queryKey: ["ubicaciones"],
    queryFn: () => apiFetch<Ubicacion[]>("ubicaciones"),
    staleTime: 60_000,
  });
}
