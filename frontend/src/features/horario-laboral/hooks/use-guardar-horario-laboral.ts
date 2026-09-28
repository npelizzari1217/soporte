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
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { guardarHorarioLaboral } from "../api";
import type { HorarioLaboralDto } from "../types";
import { HORARIO_LABORAL_QUERY_KEY } from "./use-horario-laboral";

export function useGuardarHorarioLaboral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: HorarioLaboralDto) => guardarHorarioLaboral(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HORARIO_LABORAL_QUERY_KEY });
    },
  });
}
