"use client";

/**
 * useHorarioLaboralUsuario — CONTAINER hook para
 * `GET /horario-laboral/usuarios/:usuarioId` (horario propio de un técnico,
 * odd/tasks/tiempo-tecnico.md T2). Devuelve el horario propio o, si no tiene,
 * el del cliente; `origen` dice cuál de los dos es.
 *
 * El query key cuelga de `HORARIO_LABORAL_QUERY_KEY` a propósito: el
 * `invalidateQueries` de `useGuardarHorarioLaboral` matchea por prefijo, así
 * que guardar el horario del cliente también refresca a los técnicos que lo
 * usan (`origen: "CLIENTE"`).
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { obtenerHorarioLaboralUsuario } from "../api";
import type { HorarioLaboralUsuario } from "../types";
import { HORARIO_LABORAL_QUERY_KEY } from "./use-horario-laboral";

/**
 * @param usuarioId Técnico cuyo horario se lee.
 * @returns El query key de ese técnico.
 */
export function horarioLaboralUsuarioQueryKey(usuarioId: string): readonly string[] {
  return [...HORARIO_LABORAL_QUERY_KEY, "usuarios", usuarioId];
}

/**
 * @param usuarioId Técnico elegido; `undefined` mientras no hay ninguno, y la query no corre.
 * @returns La query, con `data` como el horario resuelto del técnico.
 */
export function useHorarioLaboralUsuario(
  usuarioId: string | undefined,
): UseQueryResult<HorarioLaboralUsuario, Error> {
  return useQuery({
    queryKey: horarioLaboralUsuarioQueryKey(usuarioId ?? ""),
    queryFn: () => obtenerHorarioLaboralUsuario(usuarioId ?? ""),
    staleTime: 30_000,
    enabled: usuarioId !== undefined,
  });
}
