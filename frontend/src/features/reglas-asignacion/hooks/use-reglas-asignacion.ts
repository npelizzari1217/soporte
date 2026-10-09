"use client";

/**
 * useReglasAsignacion — CONTAINER hook para `GET /reglas-asignacion` (una fila
 * por tipo activo y los candidatos por módulo). `queryKey` FLAT, como el resto
 * de los catálogos del front. Solo la consume la vista de administración
 * (`<SoloAdminCliente>`); el backend re-valida con `AdminClienteGuard`.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { reglasAsignacionVistaSchema } from "../schemas";

export function useReglasAsignacion() {
  return useQuery({
    queryKey: ["reglas-asignacion"],
    queryFn: async () => reglasAsignacionVistaSchema.parse(await apiFetch<unknown>("reglas-asignacion")),
  });
}
