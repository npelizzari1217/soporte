/**
 * Historial del valor de un equipo (odd/tasks/historial-valor-residual.md, S1-S4).
 *
 * Cada fila es un día de calendario con el valor que el equipo tenía ese día. Una fila por equipo
 * y día: el último guardado del día reemplaza al anterior (S3). Sin imports de Prisma ni NestJS.
 */

/**
 * Orígenes de una valoración. Fuente única del CHECK `equipo_valoraciones_origen_check`: un test
 * de integración compara este array contra `pg_get_constraintdef`.
 * - `MANUAL`: un usuario guardó el equipo con un valor residual nuevo (S2).
 * - `MIGRACION`: el backfill que arrancó el historial con los valores que el equipo ya tenía (S4).
 */
export const ORIGENES_VALORACION_EQUIPO = ['MANUAL', 'MIGRACION'] as const;
export type OrigenValoracionEquipo = (typeof ORIGENES_VALORACION_EQUIPO)[number];

/**
 * Indica si un valor leído de afuera del dominio es un origen del catálogo.
 *
 * @param valor Valor a verificar (por ejemplo, la columna `origen` leída de la base).
 * @returns `true` si es uno de `ORIGENES_VALORACION_EQUIPO`.
 */
export function esOrigenValoracionEquipo(valor: unknown): valor is OrigenValoracionEquipo {
  return (
    typeof valor === 'string' && (ORIGENES_VALORACION_EQUIPO as readonly string[]).includes(valor)
  );
}

/** Una valoración guardada en el historial del equipo. */
export interface ValoracionEquipo {
  id: string;
  equipoId: string;
  /** Día de calendario (`@db.Date`): medianoche UTC; se lee con componentes UTC. */
  fecha: Date;
  importe: number;
  origen: OrigenValoracionEquipo;
  /** Quién guardó el valor; `null` en las filas de migración. */
  usuarioId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Valoración que registra un guardado del equipo (alta o edición). Siempre es `MANUAL`. */
export interface NuevaValoracionEquipo {
  equipoId: string;
  fecha: Date;
  importe: number;
  usuarioId: string;
}

/** Valor residual de un equipo con su fecha, tal como queda guardado en el equipo. */
export interface ValorResidualDeEquipo {
  valorResidual: number | null;
  fechaValorResidual: Date | null;
}

/**
 * Clave del día de calendario de una fecha `@db.Date`, leída en componentes UTC. Comparar por
 * `getTime()` fallaría si una fecha del borde trae hora y la de la base no.
 *
 * @param fecha Fecha de calendario.
 * @returns `"YYYY-MM-DD"`.
 */
export function claveDiaCalendario(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/**
 * Decide si un guardado del equipo registra una valoración (S2).
 *
 * Registra cuando el valor residual guardado tiene monto y fecha, y alguno de los dos difiere de
 * lo que el equipo tenía antes. En el alta (`anterior = null`) alcanza con que los dos estén
 * cargados. Si el valor residual queda vacío (sin monto o sin fecha) no se registra nada: el
 * historial conserva lo anterior y no anota un "sin valor".
 *
 * @param anterior Valor residual antes del guardado; `null` en el alta.
 * @param guardado Valor residual que queda guardado.
 * @returns Fecha e importe a registrar, o `null` si el guardado no cambia el valor.
 */
export function valoracionDelGuardado(
  anterior: ValorResidualDeEquipo | null,
  guardado: ValorResidualDeEquipo,
): { fecha: Date; importe: number } | null {
  const { valorResidual, fechaValorResidual } = guardado;
  if (valorResidual === null || fechaValorResidual === null) {
    return null;
  }
  if (
    anterior !== null &&
    anterior.valorResidual === valorResidual &&
    anterior.fechaValorResidual !== null &&
    claveDiaCalendario(anterior.fechaValorResidual) === claveDiaCalendario(fechaValorResidual)
  ) {
    return null;
  }
  return { fecha: fechaValorResidual, importe: valorResidual };
}
