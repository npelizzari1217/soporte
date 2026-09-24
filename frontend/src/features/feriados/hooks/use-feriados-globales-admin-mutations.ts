"use client";

/**
 * use-feriados-globales-admin-mutations — CONTAINER hooks para el ABM del
 * calendario de feriados GLOBALES (master `/feriados`, ROOT-only,
 * sdd/feriados-configurables). Mismo patrón que
 * `use-ciclos-vigentes-admin-mutations.ts`, salvo que llaman a `../api`
 * (WU6b) en vez de repetir `apiFetch` inline. Invalidan solo
 * `["feriados-globales"]` — no hay una segunda vista que lea este recurso
 * todavía.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { crearFeriado, editarFeriado, eliminarFeriado } from "../api";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { CreateFeriadoDto, UpdateFeriadoDto } from "../types";

const FERIADOS_GLOBALES_QUERY_KEY = ["feriados-globales"];

export function useCrearFeriado() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateFeriadoDto) => crearFeriado(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FERIADOS_GLOBALES_QUERY_KEY });
      notifySuccess("Feriado creado.");
    },
    onError: notifyError,
  });
}

export function useEditarFeriado(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateFeriadoDto) => editarFeriado(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FERIADOS_GLOBALES_QUERY_KEY });
      notifySuccess("Feriado actualizado.");
    },
    onError: notifyError,
  });
}

export function useEliminarFeriado() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => eliminarFeriado(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FERIADOS_GLOBALES_QUERY_KEY });
      notifySuccess("Feriado eliminado.");
    },
    onError: notifyError,
  });
}
