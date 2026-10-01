/**
 * Formato de cantidades de stock en pantalla (es-AR, coma decimal).
 *
 * Unidad `entera` con valor entero => sin decimales ("3"); cualquier valor
 * fraccionario => siempre dos decimales ("2,50"), sin redondear a entero.
 * Los negativos salen como números ("-3"); `-0` se normaliza a `0`.
 * Misma regla que `cantidadCsv` del backend.
 */
import { formatearNumeroEsAr } from "@/shared/lib/formato-numero";

/**
 * @param valor Cantidad a mostrar.
 * @param entera Si la unidad de medida es entera.
 * @returns Texto es-AR de la cantidad.
 */
export function formatearCantidadEsAr(valor: number, entera: boolean): string {
  // `+ 0` convierte -0 en 0; un fraccionario que redondea a -0,00 se normaliza igual.
  const normalizado = Math.abs(valor) < 0.005 ? 0 : valor + 0;
  if (entera && Number.isInteger(normalizado)) {
    return normalizado.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  }
  return formatearNumeroEsAr(normalizado);
}
