"use client";

/**
 * useSerialesRecepcion — CONTAINER hook de los seriales de una recepción de un
 * insumo `SERIE`. Guarda lo tipeado y lo valida contra el delta (lo que se
 * recibe ahora, no el acumulado). Con `requiere` en `false` no hay casillas y
 * `validar` devuelve `undefined`: el payload no lleva `seriales`.
 */
import { useState } from "react";
import { evaluarSerialesRecepcion } from "../lib/seriales-recepcion";

export function useSerialesRecepcion(requiere: boolean, delta: number) {
  const [valores, setValores] = useState<string[]>([]);
  const evaluacion = evaluarSerialesRecepcion(delta, valores);
  return {
    requiere,
    cantidad: evaluacion.cantidad,
    valores,
    errores: evaluacion.errores,
    pendientes: evaluacion.pendientes,
    onChange: (indice: number, valor: string) =>
      setValores((previos) => {
        const siguientes = [...previos];
        while (siguientes.length <= indice) siguientes.push("");
        siguientes[indice] = valor;
        return siguientes;
      }),
    /** Seriales a enviar (solo los cargados), `undefined` si no aplica o no hay ninguno, `null` si hay algo por corregir. */
    validar: (): string[] | undefined | null => {
      if (!requiere) return undefined;
      if (evaluacion.seriales === null) return null;
      return evaluacion.seriales.length > 0 ? evaluacion.seriales : undefined;
    },
    reiniciar: () => setValores([]),
  };
}
