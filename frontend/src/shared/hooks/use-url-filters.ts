"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/** Opciones de `updateFiltros`. */
export interface OpcionesUpdateFiltros {
  /**
   * ¿Volver a la página 1 después de aplicar el patch? Por defecto `true`:
   * cambiar un filtro estando en la página 3 dejaba el listado vacío.
   */
  resetPage?: boolean;
}

/** API que `useUrlFilters` expone al listado. */
export interface UrlFilters<TFiltros extends object> {
  /** Aplica un patch parcial sobre los searchParams actuales y navega. */
  updateFiltros: (patch: Partial<TFiltros>, opts?: OpcionesUpdateFiltros) => void;
  /** Cambia SOLO la página, conservando el resto de los filtros. */
  irAPagina: (pagina: number) => void;
  /** Deja la URL como recién entrado a la pantalla: se van TODOS los filtros, la página incluida. */
  limpiarFiltros: () => void;
}

/**
 * Filtros de listado viviendo en la URL (ADR-2): deep-link y back/forward
 * funcionan sin estado cliente duplicado.
 *
 * POR QUÉ EXISTE: esta lógica estaba copiada tres veces —`KbListView`,
 * `TicketsListView`, `ComprasListView`— y las copias NO eran idénticas. La
 * diferencia peligrosa es el nombre del parámetro de página: KB usa `page` y
 * los otros dos `pagina`. Con tres copias, tocar una sola (o "unificar" el
 * nombre de prensa al mover código) rompe el reseteo de página del listado que
 * no se miró, y el síntoma —una página vieja pegada en la URL que deja la
 * grilla vacía para siempre— se lee como "los datos no cargaron", no como un
 * bug de filtros. Por eso el nombre del parámetro es un argumento explícito y
 * tipado contra las claves del propio tipo de filtros de la feature: un typo o
 * un nombre ajeno no compila.
 *
 * @param paramPagina Nombre del searchParam de página. Tiene que ser una clave
 *   real de `TFiltros` (`"page"` en KB, `"pagina"` en tickets y compras).
 * @returns `updateFiltros`, `irAPagina` y `limpiarFiltros` ligados a la ruta actual.
 *
 * @example
 * const { updateFiltros, irAPagina, limpiarFiltros } = useUrlFilters<KbFiltros>("page");
 */
export function useUrlFilters<TFiltros extends object>(
  paramPagina: Extract<keyof TFiltros, string>,
): UrlFilters<TFiltros> {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateFiltros = useCallback(
    (patch: Partial<TFiltros>, opts: OpcionesUpdateFiltros = {}) => {
      const next = new URLSearchParams(searchParams.toString());
      // Un valor vacío no es "filtrar por vacío": es no filtrar. Se borra la
      // clave para que la URL no acumule basura (`?estado=&busqueda=`).
      const entradas: ReadonlyArray<[string, unknown]> = Object.entries(patch);
      for (const [clave, valor] of entradas) {
        if (valor === undefined || valor === "") next.delete(clave);
        else next.set(clave, String(valor));
      }
      if (opts.resetPage ?? true) next.set(paramPagina, "1");
      router.replace(`${pathname}?${next.toString()}`);
    },
    [router, pathname, searchParams, paramPagina],
  );

  const irAPagina = useCallback(
    (pagina: number) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set(paramPagina, String(pagina));
      router.replace(`${pathname}?${next.toString()}`);
    },
    [router, pathname, searchParams, paramPagina],
  );

  const limpiarFiltros = useCallback(() => {
    router.replace(pathname);
  }, [router, pathname]);

  return { updateFiltros, irAPagina, limpiarFiltros };
}
