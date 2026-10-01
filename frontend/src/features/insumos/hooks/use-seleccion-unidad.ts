"use client";

/**
 * useSeleccionUnidad — CONTAINER hook de la pieza que se elige en una salida o
 * en un ajuste negativo de un insumo `SERIE`. Pide al backend las unidades
 * elegibles y guarda cuál se eligió.
 *
 * - `salida`: `?disponibles=true`, las `EN_DEPOSITO` CON serial (una pendiente
 *   no se puede entregar).
 * - `ajuste`: `?estado=EN_DEPOSITO`, que SÍ incluye las pendientes (decisión F1:
 *   una pendiente se puede dar de baja con motivo).
 *
 * La `queryKey` cuelga de `["insumo", id, "unidades"]`, así que toda mutación
 * que invalida las unidades la refresca por prefijo. Con `requiere` en `false`
 * no hay consulta y `validar` devuelve `undefined`: el payload no lleva
 * `unidadId`.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { UnidadInsumo } from "../types";

export type ModoSeleccionUnidad = "salida" | "ajuste";

const FILTRO: Record<ModoSeleccionUnidad, string> = {
  salida: "disponibles=true",
  ajuste: "estado=EN_DEPOSITO",
};

export interface SeleccionUnidad {
  requiere: boolean;
  unidades: UnidadInsumo[] | undefined;
  cargando: boolean;
  fallo: boolean;
  /** Unidad elegida; vacío si no eligió o si la que eligió ya no figura en la lista. */
  unidadId: string;
  error: string | undefined;
  elegir: (unidadId: string) => void;
  /** Devuelve el `unidadId` a enviar, `undefined` si no aplica, o `null` si falta elegir. */
  validar: () => string | undefined | null;
  /** Vuelve a pedir la lista (la unidad la tomó otra operación). */
  refrescar: () => void;
  reiniciar: () => void;
}

/**
 * @param insumoId Insumo cuyas unidades se listan.
 * @param requiere `true` cuando el movimiento exige elegir una pieza.
 * @param modo Qué lista de unidades corresponde a la puerta.
 */
export function useSeleccionUnidad(insumoId: string, requiere: boolean, modo: ModoSeleccionUnidad): SeleccionUnidad {
  const [elegida, setElegida] = useState("");
  const [intentado, setIntentado] = useState(false);
  const query = useQuery({
    staleTime: 0,
    queryKey: ["insumo", insumoId, "unidades", "seleccion", modo],
    queryFn: () => apiFetch<UnidadInsumo[]>(`insumos/${insumoId}/unidades?${FILTRO[modo]}`),
    enabled: !!insumoId && requiere,
  });

  const unidadId = query.data?.some((unidad) => unidad.id === elegida) ? elegida : "";

  return {
    requiere,
    unidades: query.data,
    cargando: query.isLoading,
    fallo: query.isError,
    unidadId,
    error: intentado && requiere && !unidadId ? "Elegí la pieza" : undefined,
    elegir: setElegida,
    validar: () => {
      if (!requiere) return undefined;
      setIntentado(true);
      return unidadId || null;
    },
    refrescar: () => {
      void query.refetch();
    },
    reiniciar: () => {
      setElegida("");
      setIntentado(false);
    },
  };
}
