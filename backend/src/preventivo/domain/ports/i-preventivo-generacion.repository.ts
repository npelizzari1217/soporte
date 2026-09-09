/**
 * Catálogo cerrado de resultados de un ciclo, en runtime — ÚNICA fuente de
 * verdad: el tipo se deriva de acá, no al revés (mismo idiom que
 * `ESTADOS_APROBACION_ITEM` en `compras/domain/services/estado-compra.ts`).
 *
 * Existe como array y no solo como unión porque el CHECK
 * `preventivo_generacion_resultado_check` (migración `20260825110000_preventivo_planes`)
 * enumera los mismos cuatro valores en la DB, y una unión de TypeScript se
 * borra al compilar: sin esta constante no hay nada que un test pueda
 * comparar contra la base. La deriva entre ambas listas se verifica en
 * `preventivo-schema.integration.spec.ts`.
 */
export const RESULTADOS_GENERACION = [
  'RESERVADO',
  'GENERADO',
  'SALTEADO_PENDIENTE',
  'SALTEADO_ATRASO',
] as const;

/** Catálogo cerrado de resultados de un ciclo (`preventivo_generacion_resultado_check`, WU-2). */
export type ResultadoGeneracion = (typeof RESULTADOS_GENERACION)[number];

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
   * carrera. El caller NO hace rollback: retorna, y la transacción COMMITEA —
   * lo único que pudo haber aplicado antes son los `registrarSalteadoAtraso`
   * del mismo ciclo, que son `ON CONFLICT DO NOTHING` y por lo tanto
   * idempotentes. El avance del puntero ya lo committeó la corrida ganadora.
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

  /**
   * `true` si el plan tiene un ticket GENERADO todavía abierto y sin
   * atender ([R8]): existe una generación con `ticket_id` no nulo cuyo
   * ticket no está soft-deleted y su estado NO es
   * `RESUELTO`/`CERRADO`/`CANCELADO`. Usado por `GenerarPreventivosUseCase`
   * (WU-5) para decidir `SALTEADO_PENDIENTE` vs. generar un ticket nuevo.
   *
   * Resuelve por el enlace `preventivo_generacion.ticket_id`, NUNCA por el
   * tipo del ticket — y eso es lo que hace segura la transición del issue
   * #135: en un tenant ya migrado, el ticket abierto de un plan puede ser
   * uno viejo de tipo `MANTENIMIENTO` y sigue frenando el ciclo nuevo igual.
   *
   * Ref design: ADR-PV2 (paso 2 de la transacción por ciclo). Tarea: 5.3/5.4.
   */
  existeTicketAbiertoDelPlan(planId: string): Promise<boolean>;
}

/** Token de inyección de dependencias para IPreventivoGeneracionRepository en NestJS. */
export const PREVENTIVO_GENERACION_REPOSITORY = Symbol('PREVENTIVO_GENERACION_REPOSITORY');
