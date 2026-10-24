"use client";

/**
 * use-debounced-value — devuelve el valor recibido recién cuando deja de
 * cambiar durante `demoraMs`.
 *
 * Existe para los buscadores que consultan al servidor mientras se tipea: sin
 * la demora, cada tecla dispara una consulta y las respuestas pueden llegar
 * fuera de orden. Mientras el valor sigue cambiando, el hook conserva el
 * último valor estable.
 */
import { useEffect, useState } from "react";

/**
 * @param valor Valor de entrada, normalmente el texto de un `<input>`.
 * @param demoraMs Milisegundos sin cambios que tienen que pasar antes de
 *   publicar el valor nuevo.
 * @returns El último valor que se mantuvo estable durante `demoraMs`.
 */
export function useDebouncedValue<T>(valor: T, demoraMs: number): T {
  const [estable, setEstable] = useState(valor);

  useEffect(() => {
    const temporizador = setTimeout(() => setEstable(valor), demoraMs);
    return () => clearTimeout(temporizador);
  }, [valor, demoraMs]);

  return estable;
}
