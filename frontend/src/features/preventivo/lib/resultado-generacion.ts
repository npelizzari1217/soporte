/**
 * Mapeo visual del `resultado` de una generación — compartido por el listado
 * (columna "última generación") y la vista de generaciones de un plan
 * (WU-7.2/7.3). `RESERVADO` es transitorio dentro de la transacción del
 * ciclo (ADR-PV2) y nunca queda committeado — no debería llegar nunca por
 * HTTP, pero se mapea igual para no romper si algún día aparece.
 */
import type { BadgeProps } from "@/components/ui/badge";
import type { ResultadoGeneracion } from "../types";

const ETIQUETAS: Record<ResultadoGeneracion, string> = {
  RESERVADO: "Reservado",
  GENERADO: "Generado",
  SALTEADO_PENDIENTE: "Salteado (pendiente)",
  SALTEADO_ATRASO: "Salteado (atraso)",
};

const VARIANTES: Record<ResultadoGeneracion, NonNullable<BadgeProps["variant"]>> = {
  RESERVADO: "outline",
  GENERADO: "success",
  SALTEADO_PENDIENTE: "warning",
  SALTEADO_ATRASO: "warning",
};

/**
 * Etiqueta legible en español para un `resultado` de generación.
 *
 * @param resultado - Uno de los 4 códigos del CHECK `preventivo_generacion_resultado_check`.
 * @returns El texto a mostrar al usuario.
 */
export function etiquetaResultado(resultado: ResultadoGeneracion): string {
  return ETIQUETAS[resultado];
}

/**
 * Variante de `<Badge>` asociada a un `resultado` de generación.
 *
 * @param resultado - Uno de los 4 códigos del CHECK `preventivo_generacion_resultado_check`.
 * @returns La variante de badge a usar.
 */
export function badgeVariantDeResultado(resultado: ResultadoGeneracion): NonNullable<BadgeProps["variant"]> {
  return VARIANTES[resultado];
}
