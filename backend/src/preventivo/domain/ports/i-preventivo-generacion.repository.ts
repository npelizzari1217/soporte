/** Catálogo cerrado de resultados de un ciclo (`preventivo_generacion_resultado_check`, WU-2). */
export type ResultadoGeneracion =
  'RESERVADO' | 'GENERADO' | 'SALTEADO_PENDIENTE' | 'SALTEADO_ATRASO';

/** Fila de auditoría de un ciclo (`preventivo_generacion`) — hard fact, sin `updatedAt`/`deletedAt`. */
export interface PreventivoGeneracionProps {
  id: string;
  planId: string;
  fechaProgramada: Date;
  resultado: ResultadoGeneracion;
  ticketId: string | null;
  createdAt: Date;
}

/**
 * IPreventivoGeneracionRepository — puerto de persistencia para
 * `preventivo_generacion` (TENANT). Definido en la capa de dominio: sin
 * imports de Prisma ni NestJS.
 *
 * El orden de estos métodos calca la transacción por ciclo de ADR-PV2 —
 * `reservar` PRIMERO, siempre — pero la orquestación transaccional en sí
 * (BEGIN/COMMIT/ROLLBACK, el runner re-entrante de WU-0) es responsabilidad
 * del use case de WU-5, no de este puerto.
 *
 * Ref design: ADR-PV2 (transacción por ciclo), ADR-PV3 (recuperación).
 * Tarea: 3.6.
 */
export interface IPreventivoGeneracionRepository {
  /**
   * `INSERT INTO preventivo_generacion (plan_id, fecha_programada,
   * resultado) VALUES ($plan, $fecha, 'RESERVADO') ON CONFLICT DO NOTHING
   * RETURNING id` — PRIMERA sentencia de la transacción del ciclo
   * (ADR-PV2). Retorna `null` si la fila ya existía: otra corrida ganó la
   * carrera, el caller hace ROLLBACK sin más trabajo.
   */
  reservar(planId: string, fechaProgramada: Date): Promise<string | null>;

  /** Cierra el ciclo reservado como `GENERADO`, con el ticket ya creado. */
  marcarGenerado(id: string, ticketId: string): Promise<void>;

  /** Cierra el ciclo reservado como `SALTEADO_PENDIENTE` (preventivo abierto sin atender, [R8]). */
  marcarSalteadoPendiente(id: string): Promise<void>;

  /**
   * Registra un ciclo de recuperación salteado por atraso, sin ticket
   * (ADR-PV3). `ON CONFLICT DO NOTHING` — idempotente ante reintentos.
   */
  registrarSalteadoAtraso(planId: string, fechaProgramada: Date): Promise<void>;

  /** Generaciones de un plan, para la vista de auditoría (WU-4/WU-7). */
  listarPorPlan(planId: string): Promise<PreventivoGeneracionProps[]>;
}

/** Token de inyección de dependencias para IPreventivoGeneracionRepository en NestJS. */
export const PREVENTIVO_GENERACION_REPOSITORY = Symbol('PREVENTIVO_GENERACION_REPOSITORY');
