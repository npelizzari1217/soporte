"use client";

/**
 * use-roles — CONTAINER hook para `GET /roles` (item 3 backend-gaps —
 * cierra el gap documentado en B4: antes `ROLES_TENANT` hardcodeado acá).
 * Catálogo GLOBAL (`master.roles`), compartido por todos los tenants —
 * `staleTime` largo, no cambia en runtime.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { Role } from "../types";

export function useRoles() {
  return useQuery({
    queryKey: ["roles"],
    queryFn: () => apiFetch<Role[]>("roles"),
    staleTime: 5 * 60_000,
  });
}
