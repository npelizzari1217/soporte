/**
 * MedidorTiempoSla — puerto de dominio con el que `RelojSla` mide y suma
 * tiempo de SLA sin saber de qué cohorte es el ticket.
 *
 * - `entre(a, b)`: milisegundos medidos entre dos instantes (0 si `b <= a`).
 * - `sumar(a, ms)`: instante que resulta de sumar `ms` milisegundos medidos
 *   a `a`.
 *
 * Dos implementaciones: `MedidorHabil` (tiempo hábil del calendario vigente)
 * y `MedidorCorrido` (tiempo de pared, cohorte `CORRIDO`).
 *
 * Ref: sdd/sla-primera-respuesta-y-pausa, ADR-2.
 */
export interface MedidorTiempoSla {
  entre(a: Date, b: Date): number;
  sumar(a: Date, ms: number): Date;
}
