"use client";

/**
 * useFeriadosCliente — CONTAINER hook para `GET /feriados-cliente` (feriados
 * propios del tenant, sdd/feriados-configurables), consumido por la pantalla
 * combinada `/feriados` (task 8.1, WU8a). Llama a `listarFeriadosCliente()`
 * (`../api.ts`, WU6b) en vez de repetir `apiFetch` inline — mismo criterio
 * que `useFeriadosGlobales`.
 *
 * El backend ya devuelve la lista ordenada por `fecha` asc (D8, design.md);
 * este hook no reordena client-side — `combinarFeriados()` re-ordena la
 * unión de ambas listas.
 */
import { useQuery } from "@tanstack/react-query";
import { listarFeriadosCliente } from "../api";

export function useFeriadosCliente() {
  return useQuery({
    queryKey: ["feriados-cliente"],
    queryFn: listarFeriadosCliente,
    staleTime: 30_000,
  });
}
