/**
 * Ayuda de cálculo de depreciación de equipos (UI-only — el % NO se persiste).
 *
 * Deriva el valor residual a partir de una BASE y un porcentaje de depreciación:
 * `valorResidual = base × (1 − %/100)`. Ej.: $1000 al 30% → $700.
 *
 * La depreciación es COMPUESTA (`baseDepreciacion`): la primera vez la base es el
 * `importe` original; una vez que existe un valor residual, cada nueva
 * depreciación se aplica SOBRE ese último valor residual (encadenada), no sobre
 * el importe original.
 */
import { parsearNumeroEsAr } from "@/shared/lib/formato-numero";

/** Redondea a 2 decimales y clampa a 0 (un % > 100 daría residual negativo). */
export function calcularValorResidual(base: number, porcentaje: number): number {
  const residual = base * (1 - porcentaje / 100);
  return Math.max(0, Math.round(residual * 100) / 100);
}

/**
 * Base sobre la que se aplica la depreciación: el valor residual actual (si ya
 * hubo un cálculo previo — depreciación compuesta) o, si aún no hay, el importe
 * original del equipo. `null` si no hay ninguno de los dos.
 */
export function baseDepreciacion(
  importe: number | null,
  valorResidualActual: number | null,
): number | null {
  return valorResidualActual ?? importe;
}

/**
 * Adaptador de firma sobre `parsearNumeroEsAr` (`shared/lib/formato-numero.ts`):
 * lo único propio de esta función es el guard de `undefined` (los campos de
 * RHF de Equipos son opcionales). El resto — trim, vacío → `null`, coma
 * decimal y desambiguación del punto de miles — lo resuelve la función
 * compartida. Delega, no reimplementa: `MontoInput` usa la MISMA función
 * para canonizar al blur, así que el submit entiende exactamente lo mismo
 * que el usuario ve en pantalla, incluso sin blur (Enter dentro del form).
 *
 * Regla de miles heredada de `parsearNumeroEsAr`: el punto sólo se lee como
 * separador de miles cuando ADEMÁS hay una coma decimal en la cadena. Sin
 * coma, `"1.234"` sigue siendo el número `1.234`, no `1234` — no hay forma
 * de desambiguar un punto suelto sin esa señal.
 *
 * Esto no cambia el momento en que `MontoInput` canoniza (sigue siendo al
 * blur); solo hace que el submit entienda lo mismo que la pantalla muestra.
 */
export function parseImporte(valor: string | undefined): number | null {
  if (valor === undefined) return null;
  return parsearNumeroEsAr(valor);
}
