/**
 * Filtros del reporte de stock: UNA definición para la URL de la pantalla, la
 * consulta (`useReporteStock`) y el botón de exportación.
 *
 * - `parsearFiltrosReporteStock` valida los `searchParams` con Zod; un valor
 *   inválido se IGNORA (el filtro queda ausente) en vez de romper la pantalla.
 * - `serializarFiltrosReporteStock` es el único serializador: arma el query
 *   string con orden de claves estable. Lo usan el hook y el export, así que
 *   no pueden discrepar. Espeja los query params del backend
 *   (`ReporteStockQueryDto`): `familiaId` (uuid), `esRepuesto`,
 *   `soloBajoMinimo`, `ocultarSinStock` (`true`/`false`).
 *
 * `soloBajoMinimo` y `ocultarSinStock` en `false` equivalen a ausentes y no se
 * serializan; `esRepuesto` en `false` SÍ (son los consumibles, no "sin filtro").
 */
import { z } from "zod";

/** Lee `"true"`/`"false"`; cualquier otro valor queda ausente. */
const booleanoDeQuery = z
  .preprocess((v) => (v === "true" ? true : v === "false" ? false : undefined), z.boolean().optional());

const familiaIdDeQuery = z.preprocess(
  (v) => (typeof v === "string" && v !== "" ? v : undefined),
  z.string().uuid().optional().catch(undefined),
);

export const filtrosReporteStockSchema = z.object({
  familiaId: familiaIdDeQuery,
  esRepuesto: booleanoDeQuery,
  soloBajoMinimo: booleanoDeQuery,
  ocultarSinStock: booleanoDeQuery,
});

/** Filtros activos del reporte, derivados del schema. */
export type FiltrosReporteStock = z.infer<typeof filtrosReporteStockSchema>;

/** Origen aceptado: `URLSearchParams` o el `ReadonlyURLSearchParams` de Next. */
type ParamsLegibles = { get(nombre: string): string | null };

/**
 * @param params `searchParams` de la URL.
 * @returns Los filtros válidos; los inválidos o ausentes quedan `undefined`.
 */
export function parsearFiltrosReporteStock(params: ParamsLegibles): FiltrosReporteStock {
  return filtrosReporteStockSchema.parse({
    familiaId: params.get("familiaId") ?? undefined,
    esRepuesto: params.get("esRepuesto") ?? undefined,
    soloBajoMinimo: params.get("soloBajoMinimo") ?? undefined,
    ocultarSinStock: params.get("ocultarSinStock") ?? undefined,
  });
}

/**
 * @param filtros Filtros activos.
 * @returns Query string sin `?`, con orden estable
 * (`familiaId`, `esRepuesto`, `soloBajoMinimo`, `ocultarSinStock`); vacío si no hay filtros.
 */
export function serializarFiltrosReporteStock(filtros: FiltrosReporteStock): string {
  const params = new URLSearchParams();
  if (filtros.familiaId) params.set("familiaId", filtros.familiaId);
  if (filtros.esRepuesto !== undefined) params.set("esRepuesto", String(filtros.esRepuesto));
  if (filtros.soloBajoMinimo) params.set("soloBajoMinimo", "true");
  if (filtros.ocultarSinStock) params.set("ocultarSinStock", "true");
  return params.toString();
}
