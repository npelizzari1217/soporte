"use client";

/**
 * use-serial-unidad-mutations — CONTAINER hooks para cargar el serial de una
 * unidad pendiente (`POST insumos/:id/unidades/:unidadId/serial`, `INSUMOS:ALTAS`)
 * y para corregir el de una unidad que ya lo tiene
 * (`POST .../correccion-serial`, `INSUMOS:AJUSTAR`).
 *
 * Los dos invalidan las unidades, la existencia y la bitácora del insumo. No
 * muestran toast de error: el diálogo pinta el rechazo (409 de serial repetido)
 * en el campo, y un toast lo duplicaría.
 */
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifySuccess } from "@/shared/lib/toast";
import type { UnidadInsumo } from "../types";

export interface CargarSerialDto {
  numeroSerie: string;
}

export interface CorregirSerialDto {
  numeroSerie: string;
  motivo: string;
}

function useMutacionDeSerial<TDto>(
  insumoId: string,
  unidadId: string,
  segmento: "serial" | "correccion-serial",
  mensajeExito: string,
): UseMutationResult<UnidadInsumo, Error, TDto> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: TDto) =>
      apiFetch<UnidadInsumo>(`insumos/${insumoId}/unidades/${unidadId}/${segmento}`, {
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

/** @returns La mutación que completa el serial de una unidad pendiente. */
export function useCargarSerialUnidad(insumoId: string, unidadId: string) {
  return useMutacionDeSerial<CargarSerialDto>(insumoId, unidadId, "serial", "Serial cargado.");
}

/** @returns La mutación que corrige el serial de una unidad, con su motivo. */
export function useCorregirSerialUnidad(insumoId: string, unidadId: string) {
  return useMutacionDeSerial<CorregirSerialDto>(
    insumoId,
    unidadId,
    "correccion-serial",
    "Serial corregido.",
  );
}
