"use client";

/**
 * useGuardarHorarioLaboral — CONTAINER hook para `PUT /horario-laboral`
 * (reemplazo atómico de las 7 filas, ADMINISTRADOR de cliente o ROOT,
 * sdd/horario-laboral-por-cliente, WU-7). Llama a `guardarHorarioLaboral()`
 * (`../api.ts`) e invalida `["horario-laboral"]` al guardar — mismo query
 * key de `useHorarioLaboral`, así que la vista vuelve a leer el horario
 * recién escrito.
 *
 * A propósito NO envuelve `onSuccess`/`onError` con `notifySuccess`/
 * `notifyError`: D16 (design.md) exige que un error de guardado deje el
 * form con sus valores y un alert INLINE — eso necesita el `data`/`error`
 * de la mutación dentro del componente (`reset(nuevos)`, WU-8b), no acá.
 *
 * `onSuccess` escribe el horario devuelto DIRECTO en la cache de la query
 * (`setQueryData`), y no solo la invalida — fix de W1 (verify-report.md,
 * `horario-laboral-por-cliente`, WU-9): con solo `invalidateQueries`, un
 * segundo guardado que arranca (`mutate`) deja `guardarMutation.data` en
 * `undefined` de inmediato, y si el container derivaba `valoresIniciales` de
 * ese `data`, el form se reseteaba a un valor intermedio y perdía la edición
 * en curso. `setQueryData` deja la cache (y por lo tanto `horarioQuery.data`,
 * la ÚNICA fuente de `valoresIniciales` desde el fix) actualizada ANTES de
 * que `invalidateQueries` dispare el refetch en segundo plano.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { guardarHorarioLaboral } from "../api";
import type { HorarioLaboral, HorarioLaboralDto } from "../types";
import { HORARIO_LABORAL_QUERY_KEY } from "./use-horario-laboral";

export function useGuardarHorarioLaboral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: HorarioLaboralDto) => guardarHorarioLaboral(dto),
    onSuccess: (data: HorarioLaboral) => {
      queryClient.setQueryData(HORARIO_LABORAL_QUERY_KEY, data);
      queryClient.invalidateQueries({ queryKey: HORARIO_LABORAL_QUERY_KEY });
    },
  });
}
