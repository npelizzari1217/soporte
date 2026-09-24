"use client";

/**
 * useFeriadosGlobales — CONTAINER hook para `GET /feriados` (feriado GLOBAL,
 * master, sdd/feriados-configurables), montado por la pantalla ROOT
 * `/admin/feriados-globales`. Llama a `listarFeriados()` (`../api.ts`, WU6b)
 * en vez de repetir `apiFetch` inline — mismo criterio que
 * `use-ciclos-vigentes-admin.ts`, salvo por la extracción de la función de
 * acceso a datos (ver la nota de alcance en `api.ts`).
 *
 * El backend ya devuelve la lista ordenada por `fecha` asc (D8, design.md;
 * `ListarFeriadosGlobales`), así que este hook no reordena client-side.
 */
import { useQuery } from "@tanstack/react-query";
import { listarFeriados } from "../api";

export function useFeriadosGlobales() {
  return useQuery({
    queryKey: ["feriados-globales"],
    queryFn: listarFeriados,
    staleTime: 30_000,
  });
}
