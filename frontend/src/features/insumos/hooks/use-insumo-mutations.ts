"use client";

/**
 * use-insumo-mutations — CONTAINER hooks para registrar movimientos de la
 * bitácora de existencias de un insumo: ENTRADA
 * (`POST /insumos/:insumoId/movimientos/entrada`) y SALIDA
 * (`POST /insumos/:insumoId/movimientos/salida`).
 *
 * Las dos comparten `useRegistrarMovimientoInsumo` (privado a este módulo):
 * mismo mecanismo de mutación, mismas dos invalidaciones al tener éxito —
 * difieren solo en el segmento de la URL y el texto del toast.
 *
 * Gate `INSUMOS:ALTAS` en el backend para las dos rutas, espejo exacto de
 * `MovimientosInsumoController.registrarEntrada`/`registrarSalida`. El gate
 * de la UI lo aplica el CALLER (mismo criterio que el resto de los diálogos
 * del repo) — estos hooks son `useMutation` sin auto-gatearse.
 *
 * Las dos mutaciones invalidan DOS lecturas al tener éxito: la existencia
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
import type { RegistrarMovimientoInsumoFormValues } from "../schemas";

/**
 * Body de `POST /insumos/:insumoId/movimientos/entrada` y de
 * `.../movimientos/salida` — MISMO shape para las dos rutas (espejo de
 * `RegistrarMovimientoInsumoHttpDto`, backend). `motivo`/`equipoId`/
 * `sectorId` OPCIONALES, igual que en el borde — el `usuarioId` no viaja
 * acá: lo estampa el servidor desde el JWT.
 */
export interface RegistrarMovimientoInsumoDto {
  cantidad: number;
  motivo?: string;
  equipoId?: string;
  sectorId?: string;
}

/**
 * Arma el body a partir de los valores ya validados del formulario:
 * `equipoId`/`sectorId`/`motivo` viajan `undefined` cuando quedan sin
 * completar en vez de la cadena vacía que deja el `<select>`/textarea (mismo
 * criterio que "Sin equipo"/"Sin sector" como opción por defecto, ver el
 * JSDoc de `MovimientoInsumoDialog`).
 *
 * @param values Valores ya validados del formulario.
 * @returns El body, listo para viajar a `POST /insumos/:insumoId/movimientos/entrada`.
 */
export function construirMovimientoInsumoDto(
  values: RegistrarMovimientoInsumoFormValues,
): RegistrarMovimientoInsumoDto {
  return {
    cantidad: values.cantidad,
    motivo: values.motivo || undefined,
    equipoId: values.equipoId || undefined,
    sectorId: values.sectorId || undefined,
  };
}

/**
 * Mecanismo compartido de las dos mutaciones de escritura de la bitácora.
 * Privado a este módulo: cada ruta expone su propio hook público más abajo,
 * con su segmento de URL y su texto de éxito ya fijados — nada por fuera de
 * este archivo instancia esto con un segmento arbitrario.
 *
 * @param insumoId Insumo cuya existencia se mueve.
 * @param segmento Último tramo de la URL (`"entrada"` | `"salida"`).
 * @param mensajeExito Texto del toast al tener éxito.
 * @returns La mutación; invalida existencia y bitácora al tener éxito.
 */
function useRegistrarMovimientoInsumo(
  insumoId: string,
  segmento: string,
  mensajeExito: string,
): UseMutationResult<MovimientoInsumo, unknown, RegistrarMovimientoInsumoDto> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: RegistrarMovimientoInsumoDto) =>
      apiFetch<MovimientoInsumo>(`insumos/${insumoId}/movimientos/${segmento}`, {
        method: "POST",
        json: dto,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insumo", insumoId, "stock"] });
      queryClient.invalidateQueries({ queryKey: ["insumo", insumoId, "movimientos"] });
      notifySuccess(mensajeExito);
    },
    onError: notifyError,
  });
}

/**
 * @param insumoId Insumo cuya existencia se mueve.
 * @returns La mutación de alta de una entrada; invalida existencia y bitácora al tener éxito.
 */
export function useRegistrarEntradaInsumo(
  insumoId: string,
): UseMutationResult<MovimientoInsumo, unknown, RegistrarMovimientoInsumoDto> {
  return useRegistrarMovimientoInsumo(insumoId, "entrada", "Entrada registrada.");
}

/**
 * @param insumoId Insumo cuya existencia se mueve.
 * @returns La mutación de baja de una salida; invalida existencia y bitácora al tener éxito.
 */
export function useRegistrarSalidaInsumo(
  insumoId: string,
): UseMutationResult<MovimientoInsumo, unknown, RegistrarMovimientoInsumoDto> {
  return useRegistrarMovimientoInsumo(insumoId, "salida", "Salida registrada.");
}
