"use client";

/**
 * useSectores — CONTAINER hook para `GET /sectores` (catálogo, WU-31,
 * `compras-tres-etapas-y-sectores` R10/S65). SIN gate de permiso — cualquier
 * usuario autenticado del tenant puede leerlo (alimenta el select de
 * `CompraCreateDialog` y el filtro de `ComprasListView`), mismo criterio que
 * `features/tickets/hooks/use-catalogos.ts`.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { Sector } from "../types";

/** Catálogo cambia con poca frecuencia (admin CRUD) — staleTime más largo que el default. */
const SECTORES_STALE_TIME = 5 * 60_000;

/**
 * @param enabled Permite no pedir el catálogo hasta que el consumidor lo
 * necesite (ej. un diálogo cerrado) — mismo criterio que
 * `useComentariosReparacion` (`features/edilicia`). `true` por defecto:
 * los callers que ya listan sectores apenas montan siguen igual.
 */
export function useSectores(enabled = true) {
  return useQuery({
    queryKey: ["sectores"],
    queryFn: () => apiFetch<Sector[]>("sectores"),
    staleTime: SECTORES_STALE_TIME,
    enabled,
  });
}
