/**
 * Formato numérico es-AR compartido por el módulo de Compras: miles con
 * punto, decimales con coma, SIEMPRE 2 decimales (`1.234.567,89`).
 *
 * Existía duplicado — `formatearTotalesPorMoneda` (`./formatear-totales.ts`)
 * y `formatMonto` (`../components/compra-items-section.tsx`) repetían el
 * mismo `toLocaleString`. Acá vive una sola vez, más su inversa, que el
 * input de monto necesita para volver de la cadena formateada al número
 * crudo que consume `z.coerce.number()`.
 */

const OPCIONES_ES_AR: Intl.NumberFormatOptions = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

/** `1234567.89` → `"1.234.567,89"`. Presentación pura: no valida ni redondea reglas de negocio. */
export function formatearNumeroEsAr(valor: number): string {
  return valor.toLocaleString("es-AR", OPCIONES_ES_AR);
}

/** `("ARS", 1234.5)` → `"ARS 1.234,50"`. Único formato de monto del módulo. */
export function formatearMontoConMoneda(moneda: string, monto: number): string {
  return `${moneda} ${formatearNumeroEsAr(monto)}`;
}

/**
 * Inversa de `formatearNumeroEsAr`, tolerante al valor CRUDO que se tipea en
 * el input (`"1234567.89"`) además de la cadena formateada
 * (`"1.234.567,89"`). Devuelve `null` cuando no hay número —  cadena vacía,
 * espacios o texto no numérico— para que quien la use decida qué mostrar en
 * vez de recibir un `NaN` o un `0` fantasma.
 *
 * Regla de desambiguación del punto: sólo se lo trata como separador de
 * miles cuando ADEMÁS hay una coma decimal. Sin coma, `"1234.5"` es el valor
 * crudo que el usuario está tipeando y el punto es decimal. `formatear`
 * nunca emite miles sin decimales (siempre agrega `,00`), así que el caso
 * ambiguo `"1.234"` no proviene de esta librería.
 */
export function parsearNumeroEsAr(texto: string): number | null {
  const limpio = texto.trim();
  if (limpio === "") return null;

  const normalizado = limpio.includes(",") ? limpio.replaceAll(".", "").replace(",", ".") : limpio;

  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}
