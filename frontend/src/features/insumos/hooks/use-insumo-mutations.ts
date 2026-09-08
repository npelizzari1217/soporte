"use client";

/**
 * use-insumo-mutations — CONTAINER hooks para registrar movimientos de la
 * bitácora de existencias de un insumo. Por ahora solo la ENTRADA
 * (`POST /insumos/:insumoId/movimientos/entrada`) — la salida y el ajuste son
 * unidades de trabajo siguientes, con su propio caso de uso y su propio gate.
 *
 * Gate `INSUMOS:ALTAS` en el backend, espejo exacto de
 * `MovimientosInsumoController.registrarEntrada`. El gate de la UI lo aplica
 * el CALLER (mismo criterio que el resto de los diálogos del repo) — este
 * hook es un `useMutation` sin auto-gatearse.
 *
 * La mutación invalida DOS lecturas al tener éxito: la existencia
 * (`["insumo", insumoId, "stock"]`, `useStockInsumo`) y la bitácora
 * (`["insumo", insumoId, "movimientos"]`, PREFIJO — cubre cualquier página
 * cacheada, ver `useMovimientosInsumo`). Un movimiento nuevo cambia las dos a
 * la vez: dejar una sin invalidar mostraría un saldo o una bitácora
 * desactualizados justo en la pantalla que se abrió para verlos.
 */
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { MovimientoInsumo } from "../types";

/**
 * Body de `POST /insumos/:insumoId/movimientos/entrada`, espejo de
 * `RegistrarMovimientoInsumoHttpDto` (backend). `motivo`/`equipoId`/
 * `sectorId` OPCIONALES, igual que en el borde — el `usuarioId` no viaja
 * acá: lo estampa el servidor desde el JWT.
 */
export interface RegistrarEntradaInsumoDto {
  cantidad: number;
  motivo?: string;
  equipoId?: string;
  sectorId?: string;
}

/**
 * @param insumoId Insumo cuya existencia se mueve.
 * @returns La mutación de alta de una entrada; invalida existencia y bitácora al tener éxito.
 */
export function useRegistrarEntradaInsumo(
  insumoId: string,
): UseMutationResult<MovimientoInsumo, unknown, RegistrarEntradaInsumoDto> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: RegistrarEntradaInsumoDto) =>
      apiFetch<MovimientoInsumo>(`insumos/${insumoId}/movimientos/entrada`, {
        method: "POST",
        json: dto,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insumo", insumoId, "stock"] });
      queryClient.invalidateQueries({ queryKey: ["insumo", insumoId, "movimientos"] });
      notifySuccess("Entrada registrada.");
    },
    onError: notifyError,
  });
}
