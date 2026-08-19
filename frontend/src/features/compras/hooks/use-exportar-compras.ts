"use client";

/**
 * use-exportar-compras — CONTAINER hook de `GET /compras/export`
 * (docs/roadmap-comercial.md punto 1). Baja el listado filtrado como CSV.
 *
 * Es un GET, pero se modela con `useMutation` y no con `useQuery` a propósito:
 * la descarga la dispara el usuario apretando un botón, tiene efecto de lado
 * (le entrega un archivo) y no se cachea ni se refetchea. Un `useQuery` con
 * `enabled: false` + `refetch()` haría lo mismo, con el riesgo agregado de que
 * TanStack decida re-ejecutarlo solo y le baje al usuario un archivo que no
 * pidió.
 *
 * Errores → `notifyError` (ADR-8, mismo criterio que `use-compra-mutations`):
 * `ApiError.messages` trae el mensaje de dominio real, incluido el 422 de
 * "demasiadas filas" que le dice al usuario que acote los filtros. Un fallo
 * silencioso acá sería el peor caso posible: el usuario cree que descargó.
 */
import { useMutation } from "@tanstack/react-query";
import { apiFetchBlob } from "@/shared/api/client";
import { dispararDescarga, nombreDesdeContentDisposition } from "@/shared/lib/descarga";
import { notifyError } from "@/shared/lib/toast";
import type { ComprasFiltros } from "../types";

/**
 * Nombre con el que se guarda el archivo si el backend no manda un
 * `Content-Disposition` legible. Sin fecha a propósito: inventarla acá sería
 * afirmar algo del contenido que este código no sabe.
 */
const NOMBRE_POR_DEFECTO = "compras.csv";

/**
 * Claves de `ComprasFiltros` que la exportación NO manda.
 *
 * `GET /compras/export` no acepta paginación porque exporta el universo
 * filtrado completo. Mandarla igual no sería inofensivo: el DTO del backend
 * rechaza claves desconocidas y el usuario vería un 400 en vez de su archivo.
 */
const CLAVES_DE_PAGINACION: ReadonlySet<string> = new Set(["pagina", "porPagina"]);

/**
 * Mapea los filtros que la pantalla tiene aplicados a la query string de
 * `GET /compras/export` (`ExportarComprasQueryDto`), descartando la
 * paginación y las claves sin valor.
 *
 * @param filtros Los MISMOS filtros con los que se pidió el listado visible.
 * @returns Query string sin el `?` inicial; vacía si no hay filtros que mandar.
 */
export function buildExportComprasQueryString(filtros: ComprasFiltros): string {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (CLAVES_DE_PAGINACION.has(clave)) continue;
    if (valor === undefined || valor === "") continue;
    params.set(clave, String(valor));
  }
  return params.toString();
}

/**
 * Descarga del listado de compras en CSV, con los filtros de la pantalla.
 *
 * @param filtros Filtros vigentes del listado (los de la URL, ADR-2).
 * @returns La mutación de TanStack — `mutate()` dispara la descarga, `isPending` alimenta el estado de carga del botón.
 */
export function useExportarCompras(filtros: ComprasFiltros) {
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const qs = buildExportComprasQueryString(filtros);
      const archivo = await apiFetchBlob(`compras/export${qs ? `?${qs}` : ""}`);
      dispararDescarga(
        archivo.blob,
        nombreDesdeContentDisposition(archivo.contentDisposition) ?? NOMBRE_POR_DEFECTO,
      );
    },
    onError: notifyError,
  });
}
