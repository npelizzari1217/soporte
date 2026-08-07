import { PresupuestoEntity } from '../entities/presupuesto.entity';

/**
 * IPresupuestoRepository — puerto de persistencia para los presupuestos de
 * proveedores (`presupuestos`).
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS. La
 * implementación concreta (`PrismaPresupuestoRepository`, PR3) obtiene su
 * cliente vía `TenantContext.getClient()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C3. Ref design: ADR-7,
 * "Firmas TS clave" (ports/*). Tarea: T2.7.
 */
export interface IPresupuestoRepository {
  /**
   * Busca un presupuesto por su identificador técnico. Retorna `null` si
   * no existe. Incluye registros soft-deleted.
   */
  findById(id: string): Promise<PresupuestoEntity | null>;

  /**
   * Retorna los presupuestos ACTIVOS (`deleted_at IS NULL`) de un
   * `ticket_compra`.
   */
  findByTicketCompraId(ticketCompraId: string): Promise<PresupuestoEntity[]>;

  /**
   * Retorna el presupuesto actualmente seleccionado (`seleccionado=true`,
   * `deleted_at IS NULL`) de un `ticket_compra`. Retorna `null` si ninguno
   * está seleccionado. Usado por `SeleccionarPresupuestoUseCase` (ADR-7)
   * para el swap atómico.
   */
  findSelectedByTicketCompraId(ticketCompraId: string): Promise<PresupuestoEntity | null>;

  /**
   * Persiste el presupuesto (upsert: crea si no existe, actualiza si
   * existe). Usado por `SeleccionarPresupuestoUseCase` para el swap
   * atómico de `seleccionado`.
   */
  save(presupuesto: PresupuestoEntity): Promise<void>;

  /**
   * Baja lógica del presupuesto (soft delete). NO elimina la fila.
   */
  delete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para IPresupuestoRepository en NestJS. */
export const PRESUPUESTO_REPOSITORY = Symbol('PRESUPUESTO_REPOSITORY');
