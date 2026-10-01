"use client";

/**
 * use-reingreso-unidad-mutations — CONTAINER hooks para devolver al depósito
 * una unidad entregada (`POST insumos/:id/unidades/:unidadId/devolucion-entrega`,
 * `INSUMOS:ALTAS`) y para recuperar una descartada
 * (`POST .../recuperacion`, `INSUMOS:AJUSTAR`).
 *
 * Los dos invalidan las unidades, la existencia y la bitácora del insumo. No
 * muestran toast de error: el diálogo pinta el rechazo del backend (p. ej. el
 * insumo que volvió a `NINGUNO`) como alerta del formulario.
 */
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifySuccess } from "@/shared/lib/toast";
import type { CondicionStock, MovimientoInsumo } from "../types";

export interface DevolverEntregaDto {
  condicion: CondicionStock;
  motivo?: string;
}

export interface RecuperarUnidadDto {
  condicion: CondicionStock;
  motivo: string;
}

function useMutacionDeReingreso<TDto>(
  insumoId: string,
  unidadId: string,
  segmento: "devolucion-entrega" | "recuperacion",
  mensajeExito: string,
): UseMutationResult<MovimientoInsumo, Error, TDto> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: TDto) =>
      apiFetch<MovimientoInsumo>(`insumos/${insumoId}/unidades/${unidadId}/${segmento}`, {
        method: "POST",
        json: dto,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insumo", insumoId, "unidades"] });
      queryClient.invalidateQueries({ queryKey: ["insumo", insumoId, "stock"] });
      queryClient.invalidateQueries({ queryKey: ["insumo", insumoId, "movimientos"] });
      notifySuccess(mensajeExito);
    },
  });
}

/** @returns La mutación que devuelve al depósito una unidad entregada. */
export function useDevolverEntregaUnidad(insumoId: string, unidadId: string) {
  return useMutacionDeReingreso<DevolverEntregaDto>(
    insumoId,
    unidadId,
    "devolucion-entrega",
    "Pieza devuelta al depósito.",
  );
}

/** @returns La mutación que recupera una unidad descartada, con su motivo. */
export function useRecuperarUnidadDescartada(insumoId: string, unidadId: string) {
  return useMutacionDeReingreso<RecuperarUnidadDto>(
    insumoId,
    unidadId,
    "recuperacion",
    "Pieza recuperada.",
  );
}
