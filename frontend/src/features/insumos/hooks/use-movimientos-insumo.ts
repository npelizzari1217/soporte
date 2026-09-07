"use client";

/**
 * useMovimientosInsumo — CONTAINER hook para
 * `GET /insumos/:insumoId/movimientos`: la bitácora paginada de un insumo, del
 * asiento más reciente al más viejo.
 *
 * Va con `staleTime: 0` EXPLÍCITO, por el mismo motivo que `useStockInsumo` y a diferencia
 * de los tres catálogos del módulo: la bitácora crece con CADA movimiento
 * —entrada, salida o ajuste—, incluido uno que registró otro usuario hace un
 * segundo. Cachearla mostraría una historia incompleta justo en la pantalla que
 * se abre para saber qué pasó.
 *
 * El endpoint exige `INSUMOS:LECTURA` en el backend, igual que el stock: las
 * dos lecturas exponen el mismo secreto —qué hay en el depósito—. La autoridad
 * sigue siendo el servidor (ADR-4); el gate de la ficha solo evita ofrecer un
 * camino que termina en 403.
 *
 * `queryKey` en SINGULAR y fuera del prefijo `["insumos"]` del catálogo, mismo
 * criterio que `["insumo", id, "stock"]`: TanStack Query invalida por prefijo,
 * y colgarla del catálogo haría que refrescar la lista refetchee la bitácora de
 * todas las fichas abiertas. La ventana entra en la clave porque cada página es
 * una respuesta distinta del servidor: sin ella, pasar a la página 2 devolvería
 * la 1 cacheada.
 *
 * Manejo de error defensivo: `apiFetch` (`shared/api/client.ts`) normaliza los
 * fallos de red y HTTP a `ApiError`/`SessionExpiredError`, y TanStack Query los
 * expone vía `error`/`isError` — mismo criterio que el resto de los hooks de
 * consulta del repo.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { buildQueryString } from "@/shared/lib/build-query-string";
import type { ListarMovimientosInsumoResponse, MovimientosInsumoFiltros } from "../types";

/**
 * Mapea la ventana pedida a la query string real del endpoint, omitiendo las
 * claves `undefined` — una clave que viaje como `"undefined"` rompe el
 * `@IsInt()`/`@Min(1)` de `ListarMovimientosInsumoQueryDto` y el usuario se come
 * un 400 por una página que nunca pidió.
 *
 * Es una función PURA y exportada, igual que `buildComprasQueryString`, para
 * que ese borde se pueda probar sin montar la query.
 *
 * @param filtros Ventana pedida; sus claves ausentes dejan decidir al servidor.
 * @returns La query string sin el `?`, o cadena vacía si no hay nada que pedir.
 */
export function buildMovimientosInsumoQueryString(filtros: MovimientosInsumoFiltros): string {
  return buildQueryString({ ...filtros });
}


/**
 * @param insumoId Insumo cuya bitácora se lista.
 * @param filtros Ventana pedida (página y tamaño).
 * @returns La query con la página de asientos, el total del insumo y la ventana efectiva.
 */
export function useMovimientosInsumo(
  insumoId: string,
  filtros: MovimientosInsumoFiltros = {},
): UseQueryResult<ListarMovimientosInsumoResponse, Error> {
  const qs = buildMovimientosInsumoQueryString(filtros);
  return useQuery({
    // `staleTime: 0` EXPLÍCITO, y no por omisión: el `QueryClient` de
    // `shared/providers/query-provider.tsx` fija 30 segundos por defecto, así
    // que omitirlo NO deja la bitácora siempre fresca —la cachea medio minuto—.
    // Con `refetchOnMount` de TanStack Query v5 refetcheando solo lo stale,
    // reabrir la ficha dentro de esa ventana mostraría un estado anterior al
    // movimiento que acaba de registrar otra persona.
    staleTime: 0,
    queryKey: ["insumo", insumoId, "movimientos", filtros],
    queryFn: () =>
      apiFetch<ListarMovimientosInsumoResponse>(
        `insumos/${insumoId}/movimientos${qs ? `?${qs}` : ""}`,
      ),
    enabled: !!insumoId,
  });
}
