"use client";

/**
 * useApiClaves — CONTAINER hook para `GET /integraciones/claves` (CA8). `queryKey`
 * FLAT, como el resto de los catálogos del front. Solo la consume la vista de
 * administración (`<SoloAdminCliente>`); el backend re-valida con `AdminClienteGuard`.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { apiClavesSchema } from "../schemas";

export const API_CLAVES_QUERY_KEY = ["api-claves"] as const;

export function useApiClaves() {
  return useQuery({
    queryKey: API_CLAVES_QUERY_KEY,
    queryFn: async () => apiClavesSchema.parse(await apiFetch<unknown>("integraciones/claves")),
  });
}
