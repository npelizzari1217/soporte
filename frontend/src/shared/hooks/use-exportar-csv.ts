"use client";

/**
 * useExportarCsv — CONTAINER hook genérico para `GET /{recurso}/export`
 * (sdd/exportar-listados-csv/design, decisión D5). Generaliza
 * `use-exportar-compras.ts`, la primera implementación de este patrón.
 *
 * Es un GET, pero se modela con `useMutation` y no con `useQuery` a propósito:
 * la descarga la dispara el usuario apretando un botón, tiene efecto de lado
 * (le entrega un archivo) y no se cachea ni se refetchea. Un `useQuery` con
 * `enabled: false` + `refetch()` haría lo mismo, con el riesgo agregado de que
 * TanStack decida re-ejecutarlo solo y le baje al usuario un archivo que no
 * pidió.
 *
 * `queryString` queda a cargo de cada feature (p. ej.
 * `buildExportComprasQueryString`) a propósito: este hook NO conoce los tipos
 * de filtro de ningún módulo. Traerlos acá invertiría la dependencia —
 * `shared/` terminaría importando tipos de `features/*`.
 *
 * Errores → `notifyError` (ADR-8): `ApiError.messages` trae el mensaje de
 * dominio real, incluido el 422 de "demasiadas filas" que le dice al usuario
 * que acote los filtros. Un fallo silencioso acá sería el peor caso posible:
 * el usuario cree que descargó.
 */
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { apiFetchBlob } from "@/shared/api/client";
import { dispararDescarga, nombreDesdeContentDisposition } from "@/shared/lib/descarga";
import { notifyError } from "@/shared/lib/toast";

export interface UseExportarCsvParams {
  /** Segmento de ruta del recurso (ej. `"compras"`, `"tickets"`). La ruta pedida es `${recurso}/export`. */
  recurso: string;
  /**
   * Nombre con el que se guarda el archivo si el backend no manda un
   * `Content-Disposition` legible. Sin fecha a propósito: inventarla acá
   * sería afirmar algo del contenido que este código no sabe.
   */
  nombrePorDefecto: string;
  /**
   * Query string YA construida por la feature (sin `?` inicial), o
   * `undefined` cuando el recurso no tiene filtros exportables (equipos,
   * reparaciones).
   */
  queryString?: string;
}

/**
 * Descarga el listado de `recurso` en CSV.
 *
 * @param params Ver {@link UseExportarCsvParams}.
 * @returns La mutación de TanStack — `mutate()` dispara la descarga, `isPending` alimenta el estado de carga del botón.
 */
export function useExportarCsv({
  recurso,
  nombrePorDefecto,
  queryString,
}: UseExportarCsvParams): UseMutationResult<void, unknown, void> {
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const ruta = `${recurso}/export${queryString ? `?${queryString}` : ""}`;
      const archivo = await apiFetchBlob(ruta);
      dispararDescarga(
        archivo.blob,
        nombreDesdeContentDisposition(archivo.contentDisposition) ?? nombrePorDefecto,
      );
    },
    onError: notifyError,
  });
}
