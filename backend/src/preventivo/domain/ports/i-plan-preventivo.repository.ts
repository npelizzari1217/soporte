import { PlanPreventivoEntity } from '../entities/plan-preventivo.entity';

/**
 * IPlanPreventivoRepository — puerto de persistencia para
 * `PlanPreventivoEntity` (TENANT, `planes_preventivo`). Definido en la
 * capa de dominio: sin imports de Prisma ni NestJS.
 *
 * `findVencibles` es la consulta del barrido (ADR-PV3/flujo de datos):
 * `activo AND deleted_at IS NULL` y la generación del puntero vencida (ver
 * el método).
 *
 * Ref design: ADR-PV1, ADR-PV3 (flujo de datos). Tarea: 3.6.
 */
export interface IPlanPreventivoRepository {
  /** Persiste un plan nuevo o ya existente (INSERT/UPDATE según corresponda). */
  guardar(plan: PlanPreventivoEntity): Promise<void>;

  /** Busca por id. `null` si no existe o está soft-deleted. */
  buscarPorId(id: string): Promise<PlanPreventivoEntity | null>;

  /**
   * Listado de planes vigentes del tenant (ABM, WU-4), acotado a los tipos de ticket dados
   * (odd/preventivo-por-tipo, S1).
   *
   * @param tipoIds Tipos cuyos planes se listan; `null`, todos.
   */
  listar(tipoIds: readonly string[] | null): Promise<PlanPreventivoEntity[]>;

  /**
   * Planes vencibles para el barrido: `activo AND deleted_at IS NULL AND
   * fecha_generacion <= hoy`, donde la fecha de generación es
   * `proxima_ejecucion_en` menos la anticipación del plan, con la misma resta
   * de calendario que `CalcularCicloService.fechaGeneracion`
   * (odd/preventivo-anticipacion T2).
   */
  findVencibles(hoy: Date): Promise<PlanPreventivoEntity[]>;

  /**
   * Escribe `proxima_ejecucion_en` DIRECTO en persistencia, fuera del
   * alcance de la entidad (que deliberadamente no expone un setter de este
   * campo — WU-3). Usado por `EditarPlanUseCase` [R2] cuando la cadencia
   * cambia: el puntero se recalcula hacia adelante desde `hoy` y se
   * persiste sin pasar por `guardar()`/`editar()`.
   */
  actualizarProximaEjecucion(planId: string, proximaEjecucionEn: Date): Promise<void>;
}

/** Token de inyección de dependencias para IPlanPreventivoRepository en NestJS. */
export const PLAN_PREVENTIVO_REPOSITORY = Symbol('PLAN_PREVENTIVO_REPOSITORY');
