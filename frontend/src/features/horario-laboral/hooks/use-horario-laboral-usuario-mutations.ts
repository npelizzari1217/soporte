"use client";

/**
 * Mutaciones del horario propio de un técnico (odd/tasks/tiempo-tecnico.md
 * T2): `PUT` para guardarlo y `DELETE` para volver al horario del cliente.
 * Las dos exigen ADMINISTRADOR o ROOT en el backend (`AdminClienteGuard`).
 *
 * Mismo criterio que `useGuardarHorarioLaboral`: la respuesta se escribe
 * DIRECTO en la cache del técnico (`setQueryData`) antes de invalidar, para
 * que el form se resetee con el dato del servidor sin esperar el refetch, y
 * sin `notifySuccess`/`notifyError` acá — el container necesita el `error` de
 * la mutación para el alert inline.
 *
 * El técnico viaja en las variables de la mutación, no en el hook: si el
 * usuario cambia de técnico con un guardado en vuelo, la respuesta cae en la
 * cache del técnico que se guardó, no en la del que se está mirando.
 *
 * Los avisos del guardado se pasan al HOOK (`avisos`) y no al `mutate`: el
 * container hace `reset()` al cambiar de técnico, y eso descarta los
 * callbacks del `mutate` en vuelo. Con los del hook, el fallo de un guardado
 * se avisa aunque el usuario ya esté mirando a otro técnico (JD-B-005).
 */
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { borrarHorarioLaboralUsuario, guardarHorarioLaboralUsuario } from "../api";
import type { HorarioLaboralDto, HorarioLaboralUsuario } from "../types";
import { horarioLaboralUsuarioQueryKey } from "./use-horario-laboral-usuario";

export interface GuardarHorarioLaboralUsuarioVars {
  usuarioId: string;
  dto: HorarioLaboralDto;
}

/** Avisos de un guardado, ligados a la mutación y no al `mutate`. */
export interface AvisosGuardadoHorarioUsuario {
  onSuccess?: (data: HorarioLaboralUsuario, vars: GuardarHorarioLaboralUsuarioVars) => void;
  onError?: (error: Error, vars: GuardarHorarioLaboralUsuarioVars) => void;
}

/**
 * @param avisos Callbacks que corren aunque el container haya hecho `reset()`.
 * @returns La mutación del `PUT`; responde el horario guardado, con `origen: "USUARIO"`.
 */
export function useGuardarHorarioLaboralUsuario(
  avisos: AvisosGuardadoHorarioUsuario = {},
): UseMutationResult<
  HorarioLaboralUsuario,
  Error,
  GuardarHorarioLaboralUsuarioVars
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ usuarioId, dto }: GuardarHorarioLaboralUsuarioVars) =>
      guardarHorarioLaboralUsuario(usuarioId, dto),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(horarioLaboralUsuarioQueryKey(vars.usuarioId), data);
      queryClient.invalidateQueries({ queryKey: horarioLaboralUsuarioQueryKey(vars.usuarioId) });
      avisos.onSuccess?.(data, vars);
    },
    onError: (error, vars) => avisos.onError?.(error, vars),
  });
}

/** @returns La mutación del `DELETE`; responde el horario del cliente, con `origen: "CLIENTE"`. */
export function useBorrarHorarioLaboralUsuario(): UseMutationResult<HorarioLaboralUsuario, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (usuarioId: string) => borrarHorarioLaboralUsuario(usuarioId),
    onSuccess: (data, usuarioId) => {
      queryClient.setQueryData(horarioLaboralUsuarioQueryKey(usuarioId), data);
      queryClient.invalidateQueries({ queryKey: horarioLaboralUsuarioQueryKey(usuarioId) });
    },
  });
}
