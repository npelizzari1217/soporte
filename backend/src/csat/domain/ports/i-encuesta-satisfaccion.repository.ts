import { EncuestaSatisfaccionEntity } from '../entities/encuesta-satisfaccion.entity';
import { MetricaFiltro } from '../../../dashboard/domain/ports/i-dashboard.repository';

/** Promedio + cantidad de respuestas sobre la ÚLTIMA respuesta por ticket (ADR-C8). */
export interface ResumenCsat {
  /** `null` si el scope filtrado no tiene ninguna respuesta (evita dividir por cero / NaN engañoso). */
  promedio: number | null;
  respuestas: number;
}

/**
 * IEncuestaSatisfaccionRepository — puerto de persistencia para
 * `EncuestaSatisfaccionEntity` (TENANT, `encuestas_satisfaccion`). Definido
 * en la capa de dominio: sin imports de Prisma ni NestJS.
 *
 * Reusa `MetricaFiltro` de `dashboard/domain` (design, sección "Contratos"):
 * `resumenPorScope` aplica el MISMO filtro combinable (ciclo/asignado) que
 * el resto del dashboard, para que el KPI de CSAT respete el scope por rol
 * (D2/ADR-C5) sin reimplementarlo.
 *
 * Ref design: ADR-C8 (DISTINCT ON por última respuesta). Tarea: 4.5.
 */
export interface IEncuestaSatisfaccionRepository {
  /** Persiste la respuesta (siempre INSERT — una respuesta no se edita). */
  guardar(respuesta: EncuestaSatisfaccionEntity): Promise<void>;

  /** Última respuesta registrada para el ticket. `null` si el ticket no tiene ninguna. */
  ultimaDeTicket(ticketId: string): Promise<EncuestaSatisfaccionEntity | null>;

  /**
   * Promedio + cantidad sobre la ÚLTIMA respuesta por ticket del scope
   * filtrado (ADR-C8, `DISTINCT ON (ticket_id) ... ORDER BY respondida_en
   * DESC`). Un ticket reabierto y recalificado no pesa doble.
   */
  resumenPorScope(filtro: MetricaFiltro): Promise<ResumenCsat>;
}

/** Token de inyección de dependencias para IEncuestaSatisfaccionRepository en NestJS. */
export const ENCUESTA_SATISFACCION_REPOSITORY = Symbol('ENCUESTA_SATISFACCION_REPOSITORY');
