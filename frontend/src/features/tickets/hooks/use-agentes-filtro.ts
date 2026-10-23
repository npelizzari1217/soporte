"use client";

/**
 * use-agentes-filtro — CONTAINER hook para `GET /tickets/agentes`. Opciones del filtro "Asignado"
 * del listado: los agentes (TECNICO o COLABORADOR) con LECTURA sobre alguno de los tipos que la
 * sesión ve, o solo sobre el tipo filtrado. La lista ya viene acotada del backend; acá no se
 * filtra nada. El backend abre la ruta con la misma regla que `GET /usuarios`
 * (`puedeVerListaDeUsuarios`): un 403 se propaga como `ApiError`.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { TecnicoAsignable } from "../types";

/**
 * @param tipoId Tipo filtrado en el listado (`?tipo=`); `undefined`, todos los que la sesión ve.
 * @param enabled `false` mientras la sesión no puede leer la lista: evita pedir un 403 seguro.
 * @returns La query, con `data` como los agentes ordenados por apellido y nombre.
 */
export function useAgentesFiltro(
  tipoId: string | undefined,
  enabled = true,
): UseQueryResult<TecnicoAsignable[], Error> {
  return useQuery({
    queryKey: ["tickets", "agentes", tipoId ?? null],
    queryFn: () =>
      apiFetch<TecnicoAsignable[]>(
        tipoId ? `tickets/agentes?tipo=${encodeURIComponent(tipoId)}` : "tickets/agentes",
      ),
    staleTime: 60_000,
    enabled,
  });
}
