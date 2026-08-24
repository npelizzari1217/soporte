import { PlanPreventivoEntity } from '../entities/plan-preventivo.entity';

/**
 * IPlanPreventivoRepository — puerto de persistencia para
 * `PlanPreventivoEntity` (TENANT, `planes_preventivo`). Definido en la
 * capa de dominio: sin imports de Prisma ni NestJS.
 *
 * `findVencibles` es la consulta del barrido (ADR-PV3/flujo de datos):
 * `activo AND deleted_at IS NULL AND proxima_ejecucion_en <= hoy`, cubierta
 * por el índice parcial `planes_preventivo_proxima_ejecucion_idx` (WU-2).
 *
 * Ref design: ADR-PV1, ADR-PV3 (flujo de datos). Tarea: 3.6.
 */
export interface IPlanPreventivoRepository {
  /** Persiste un plan nuevo o ya existente (INSERT/UPDATE según corresponda). */
  guardar(plan: PlanPreventivoEntity): Promise<void>;

  /** Busca por id. `null` si no existe o está soft-deleted. */
  buscarPorId(id: string): Promise<PlanPreventivoEntity | null>;

  /** Listado de planes del tenant (ABM, WU-4). */
  listar(): Promise<PlanPreventivoEntity[]>;

  /**
   * Planes vencibles para el barrido: `activo AND deleted_at IS NULL AND
   * proxima_ejecucion_en <= hoy` (usa el índice parcial de WU-2).
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
