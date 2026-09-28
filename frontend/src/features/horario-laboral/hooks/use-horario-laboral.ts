"use client";

/**
 * useHorarioLaboral — CONTAINER hook para `GET /horario-laboral` (horario
 * laboral del tenant, sdd/horario-laboral-por-cliente, WU-7). Llama a
 * `obtenerHorarioLaboral()` (`../api.ts`) en vez de repetir `apiFetch`
 * inline — mismo criterio que `useFeriadosCliente`.
 *
 * `isLoading` (nunca `isFetching`) es lo que consume el skeleton de la
 * vista (WU-8b, D16); `isError && !data` es lo que gatea `ErrorState`.
 */
import { useQuery } from "@tanstack/react-query";
import { obtenerHorarioLaboral } from "../api";

export const HORARIO_LABORAL_QUERY_KEY = ["horario-laboral"];

export function useHorarioLaboral() {
  return useQuery({
    queryKey: HORARIO_LABORAL_QUERY_KEY,
    queryFn: obtenerHorarioLaboral,
    staleTime: 30_000,
  });
}
