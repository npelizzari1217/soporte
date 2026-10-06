import {
  CalcularSlaHabilVenceService,
  CalendarioLaboralSemanal,
  FeriadosLaborales,
} from '../../../calendario-laboral/domain/services/calcular-sla-habil-vence.service';

const MS_POR_HORA = 3_600_000;

/** Tramo a medir: del alta del ticket a su primera respuesta. */
export interface TramoDeTiempo {
  desde: Date;
  hasta: Date;
}

/**
 * Promedio, en horas HÁBILES del calendario del cliente, de los tramos recibidos
 * (`dashboard-metricas-sla` R2). `null` si no hay tramos: sin datos no es 0 h.
 *
 * El calendario y los feriados llegan ya cargados: el caller los lee una sola vez por consulta.
 */
export function promedioHorasHabiles(
  tramos: readonly TramoDeTiempo[],
  calculo: CalcularSlaHabilVenceService,
  calendario: CalendarioLaboralSemanal,
  feriados: FeriadosLaborales,
): number | null {
  if (tramos.length === 0) return null;
  const totalMs = tramos.reduce(
    (acumulado, t) => acumulado + calculo.msHabilesEntre(t.desde, t.hasta, calendario, feriados),
    0,
  );
  return totalMs / tramos.length / MS_POR_HORA;
}
