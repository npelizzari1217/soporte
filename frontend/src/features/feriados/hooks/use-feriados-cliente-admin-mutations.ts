"use client";

/**
 * use-feriados-cliente-admin-mutations — CONTAINER hooks para el ABM de
 * feriados propios del TENANT (`/feriados-cliente`, ADMINISTRADOR de
 * cliente o ROOT, sdd/feriados-configurables, WU8b). Mismo patrón que
 * `use-feriados-globales-admin-mutations.ts` (WU7b), llamando a `../api`
 * (WU6b). Invalida `["feriados-cliente"]` — el mismo query key de
 * `useFeriadosCliente` (WU8a), así que también refresca `FeriadosListView`.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { crearFeriadoCliente, editarFeriadoCliente, eliminarFeriadoCliente } from "../api";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { CreateFeriadoClienteDto, UpdateFeriadoClienteDto } from "../types";

const FERIADOS_CLIENTE_QUERY_KEY = ["feriados-cliente"];

export function useCrearFeriadoCliente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateFeriadoClienteDto) => crearFeriadoCliente(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FERIADOS_CLIENTE_QUERY_KEY });
      notifySuccess("Feriado creado.");
    },
    onError: notifyError,
  });
}

export function useEditarFeriadoCliente(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateFeriadoClienteDto) => editarFeriadoCliente(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FERIADOS_CLIENTE_QUERY_KEY });
      notifySuccess("Feriado actualizado.");
    },
    onError: notifyError,
  });
}

export function useEliminarFeriadoCliente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => eliminarFeriadoCliente(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FERIADOS_CLIENTE_QUERY_KEY });
      notifySuccess("Feriado eliminado.");
    },
    onError: notifyError,
  });
}
