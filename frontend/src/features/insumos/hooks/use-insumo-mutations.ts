"use client";

/**
 * use-insumo-mutations — CONTAINER hooks para registrar movimientos de la
 * bitácora de existencias de un insumo: ENTRADA
 * (`POST /insumos/:insumoId/movimientos/entrada`), SALIDA
 * (`POST /insumos/:insumoId/movimientos/salida`) y AJUSTE
 * (`POST /insumos/:insumoId/movimientos/ajuste`).
 *
 * Las tres comparten `useRegistrarMovimientoInsumo` (privado a este módulo):
 * mismo mecanismo de mutación, mismas dos invalidaciones al tener éxito —
 * difieren solo en el segmento de la URL, el shape del body que viaja
 * (`RegistrarMovimientoInsumoDto` para entrada/salida,
 * `RegistrarAjusteInsumoDto` —que le agrega `tipo`— para el ajuste) y el
 * texto del toast. El gate de cada ruta en el backend es DISTINTO —entrada y
 * salida comparten `INSUMOS:ALTAS` porque son la operación cotidiana del
 * técnico; el ajuste exige `INSUMOS:AJUSTAR` porque es la única que puede
 * tapar un faltante (`MovimientosInsumoController`)— pero eso es un gate de
 * ACCIÓN, y estos hooks son `useMutation` sin auto-gatearse: el gate de la UI
 * lo aplica el CALLER, mismo criterio que el resto de los diálogos del repo.
 *
 * Las tres mutaciones invalidan DOS lecturas al tener éxito: la existencia
 * (`["insumo", insumoId, "stock"]`, `useStockInsumo`) y la bitácora
 * (`["insumo", insumoId, "movimientos"]`, PREFIJO — cubre cualquier página
 * cacheada, ver `useMovimientosInsumo`). Un movimiento nuevo cambia las dos a
 * la vez: dejar una sin invalidar mostraría un saldo o una bitácora
 * desactualizados justo en la pantalla que se abrió para verlos.
 */
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { CondicionStock, MovimientoInsumo, TipoAjusteInsumo } from "../types";
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
  /** Solo viaja cuando el diálogo muestra el selector; sin ella el backend aplica `NUEVO`. */
  condicion?: CondicionStock;
}

/**
 * Body de `POST /insumos/:insumoId/movimientos/ajuste` — espejo de
 * `RegistrarAjusteInsumoHttpDto` (backend): el mismo shape de arriba con el
 * discriminador `tipo` de las dos direcciones del ajuste.
 */
export interface RegistrarAjusteInsumoDto extends RegistrarMovimientoInsumoDto {
  tipo: TipoAjusteInsumo;
}

/**
 * Arma el body común a las tres rutas a partir de los valores del formulario:
 * `equipoId`/`sectorId`/`motivo` viajan `undefined` cuando quedan sin
 * completar en vez de la cadena vacía que deja el `<select>`/textarea (mismo
 * criterio que "Sin equipo"/"Sin sector" como opción por defecto, ver el
 * JSDoc de `MovimientoInsumoDialog`). El ajuste le agrega `tipo` por encima
 * en su propio caller — esta función no sabe de esa puerta ni de ninguna
 * otra.
 *
 * @param values Valores ya validados del formulario compartido.
 * @returns El body base, listo para viajar o para extenderse con `tipo`.
 */
export function construirMovimientoInsumoDto(
  values: RegistrarMovimientoInsumoFormValues,
): RegistrarMovimientoInsumoDto {
  return {
    cantidad: values.cantidad,
    motivo: values.motivo || undefined,
    equipoId: values.equipoId || undefined,
    sectorId: values.sectorId || undefined,
    condicion: values.condicion,
  };
}

/**
 * Mecanismo compartido de las tres mutaciones de escritura de la bitácora.
 * Privado a este módulo: cada ruta expone su propio hook público más abajo,
 * con su segmento de URL y su texto de éxito ya fijados — nada por fuera de
 * este archivo instancia esto con un segmento arbitrario.
 *
 * @param insumoId Insumo cuya existencia se mueve.
 * @param segmento Último tramo de la URL (`"entrada"` | `"salida"` | `"ajuste"`).
 * @param mensajeExito Texto del toast al tener éxito.
 * @returns La mutación; invalida existencia y bitácora al tener éxito.
 */
function useRegistrarMovimientoInsumo<TDto>(
  insumoId: string,
  segmento: string,
  mensajeExito: string,
): UseMutationResult<MovimientoInsumo, unknown, TDto> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: TDto) =>
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
  return useRegistrarMovimientoInsumo<RegistrarMovimientoInsumoDto>(insumoId, "entrada", "Entrada registrada.");
}

/**
 * @param insumoId Insumo cuya existencia se mueve.
 * @returns La mutación de baja de una salida; invalida existencia y bitácora al tener éxito.
 */
export function useRegistrarSalidaInsumo(
  insumoId: string,
): UseMutationResult<MovimientoInsumo, unknown, RegistrarMovimientoInsumoDto> {
  return useRegistrarMovimientoInsumo<RegistrarMovimientoInsumoDto>(insumoId, "salida", "Salida registrada.");
}

/**
 * @param insumoId Insumo cuya existencia se corrige.
 * @returns La mutación de ajuste (cualquiera de sus dos direcciones); invalida existencia y bitácora al tener éxito.
 */
export function useRegistrarAjusteInsumo(
  insumoId: string,
): UseMutationResult<MovimientoInsumo, unknown, RegistrarAjusteInsumoDto> {
  return useRegistrarMovimientoInsumo<RegistrarAjusteInsumoDto>(insumoId, "ajuste", "Ajuste registrado.");
}
