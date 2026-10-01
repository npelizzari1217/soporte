"use client";

/**
 * useSerialesMovimiento — CONTAINER hook de los seriales de una entrada o de un
 * ajuste positivo. Guarda lo tipeado en cada casilla y lo valida contra la
 * cantidad (ver `evaluarSeriales`). Con `requiere` en `false` (insumo sin
 * seguimiento por serie, o un ajuste negativo) no hay casillas y `validar`
 * devuelve `undefined`: el payload no lleva `seriales`.
 */
import { useState } from "react";
import { parsearNumeroEsAr } from "@/shared/lib/formato-numero";
import { evaluarSeriales } from "../lib/seriales";

export interface SerialesMovimiento {
  requiere: boolean;
  /** Cantidad de casillas, o `null` si la cantidad tipeada no admite seriales. */
  cantidad: number | null;
  valores: string[];
  errores: (string | undefined)[];
  onChange: (indice: number, valor: string) => void;
  /** Marca los blancos y devuelve los seriales a enviar, `undefined` si no aplica, o `null` si hay algo por corregir. */
  validar: () => string[] | undefined | null;
  reiniciar: () => void;
}

/**
 * @param requiere `true` cuando el movimiento exige un serial por pieza.
 * @param cantidadTipeada Lo que hay en el campo "Cantidad" (texto o número).
 */
export function useSerialesMovimiento(requiere: boolean, cantidadTipeada: unknown): SerialesMovimiento {
  const [valores, setValores] = useState<string[]>([]);
  const [intentado, setIntentado] = useState(false);

  const cantidad =
    typeof cantidadTipeada === "number"
      ? cantidadTipeada
      : (parsearNumeroEsAr(String(cantidadTipeada ?? "")) ?? Number.NaN);
  const evaluacion = evaluarSeriales(cantidad, valores, intentado);

  return {
    requiere,
    cantidad: evaluacion.cantidadValida ? cantidad : null,
    valores,
    errores: evaluacion.errores,
    onChange: (indice, valor) =>
      setValores((previos) => {
        const siguientes = [...previos];
        while (siguientes.length <= indice) siguientes.push("");
        siguientes[indice] = valor;
        return siguientes;
      }),
    validar: () => {
      if (!requiere) return undefined;
      setIntentado(true);
      return evaluacion.seriales;
    },
    reiniciar: () => {
      setValores([]);
      setIntentado(false);
    },
  };
}
