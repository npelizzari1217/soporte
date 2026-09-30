"use client";

/**
 * useSelectorCondicion — CONTAINER hook del selector de condición de stock
 * (`NUEVO` | `USADO`) que comparten los diálogos de movimiento de un insumo
 * y, en el alta de un componente, el diálogo de equipos (ADR-7, selector a1).
 *
 * Resuelve las tres reglas de a1 contra `useStockInsumo` (misma `queryKey`
 * `["insumo", id, "stock"]`, así que comparte caché con la ficha):
 * - **Visible** solo si el insumo `admiteUsado`, o si la consulta de stock no
 *   está disponible (`isError`, por ejemplo sin `INSUMOS:LECTURA`): en ese caso
 *   el backend decide y el selector queda habilitado, sin saldos y en NUEVO.
 *   Mientras la consulta está en vuelo no se muestra.
 * - **NUEVO preseleccionado**, también cada vez que cambia el `insumoId`: la
 *   condición elegida para un insumo no se arrastra a otro.
 * - **Fijo y deshabilitado** cuando exactamente un saldo es mayor que cero.
 *
 * `paraEnviar` es `undefined` cuando el selector no se ve: el payload no lleva
 * `condicion` y el backend aplica su default (`NUEVO`).
 */
import { useState } from "react";
import { CONDICIONES_STOCK, type CondicionStock } from "../types";
import { useStockInsumo } from "./use-stock-insumo";

export interface SelectorCondicion {
  visible: boolean;
  /** Valor efectivo: el saldo único si hay uno, o lo elegido (NUEVO por defecto). */
  valor: CondicionStock;
  /** `true` cuando el selector queda fijo en el único saldo positivo. */
  fijo: boolean;
  /** Saldos conocidos, o `undefined` si la consulta de stock no está disponible. */
  saldos: Record<CondicionStock, number> | undefined;
  onChange: (condicion: CondicionStock) => void;
  /** Vuelve a NUEVO; se llama al cerrar el diálogo. */
  reiniciar: () => void;
  /** La condición a incluir en el payload, o `undefined` si el selector no se muestra. */
  paraEnviar: CondicionStock | undefined;
}

/**
 * @param insumoId Insumo cuyos saldos gobiernan el selector; vacío desactiva la consulta.
 */
export function useSelectorCondicion(insumoId: string): SelectorCondicion {
  const stockQuery = useStockInsumo(insumoId, { refetchOnMount: false });
  const [elegida, setElegida] = useState<CondicionStock>("NUEVO");
  const [insumoPrevio, setInsumoPrevio] = useState(insumoId);
  // Ajuste de estado durante el render (patrón de React para derivar estado de
  // una prop): al cambiar el insumo se vuelve a NUEVO sin un render intermedio
  // con la condición vieja.
  if (insumoPrevio !== insumoId) {
    setInsumoPrevio(insumoId);
    setElegida("NUEVO");
  }

  const stock = stockQuery.data;
  const visible = stockQuery.isError || stock?.admiteUsado === true;
  const positivas = stock ? CONDICIONES_STOCK.filter((condicion) => stock.saldos[condicion] > 0) : [];
  const fijada = positivas.length === 1 ? positivas[0] : undefined;
  const valor = fijada ?? elegida;

  return {
    visible,
    valor,
    fijo: fijada !== undefined,
    saldos: stock?.saldos,
    onChange: setElegida,
    reiniciar: () => setElegida("NUEVO"),
    paraEnviar: visible ? valor : undefined,
  };
}
