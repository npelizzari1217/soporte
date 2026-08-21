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
 * Parsea un valor de input numérico ("1000", "1000,50", "") a number, o null si
 * está vacío/ inválido. Acepta coma o punto decimal.
 */
export function parseImporte(valor: string | undefined): number | null {
  if (valor === undefined || valor.trim() === "") return null;
  const n = Number(valor.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
