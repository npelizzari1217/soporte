/**
 * Ayuda de cálculo de depreciación de equipos (UI-only — el % NO se persiste).
 *
 * Deriva el valor residual a partir del importe y un porcentaje de depreciación:
 * `valorResidual = importe × (1 − %/100)`. Ej.: $1000 al 30% → $700.
 */

/** Redondea a 2 decimales y clampa a 0 (un % > 100 daría residual negativo). */
export function calcularValorResidual(importe: number, porcentaje: number): number {
  const residual = importe * (1 - porcentaje / 100);
  return Math.max(0, Math.round(residual * 100) / 100);
}

/** Fecha de HOY en horario LOCAL, formato "YYYY-MM-DD" para `<input type="date">`. */
export function hoyISO(): string {
  const d = new Date();
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
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
