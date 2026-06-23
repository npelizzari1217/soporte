import { PresupuestoEntity } from '../entities/presupuesto.entity';

/**
 * IPresupuestoRepository — puerto de persistencia para los presupuestos de proveedores.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La implementación concreta vive en infrastructure/persistence/prisma/.
 * El repositorio opera dentro del tenant activo (client desde TenantContext).
 *
 * Ref spec: [SPEC:compras/Tabla presupuestos, Selección única de presupuesto]
 * Tarea: 4.A.3
 */
export interface IPresupuestoRepository {
  /**
   * Busca un presupuesto por su identificador técnico.
   * Retorna null si no existe.
   */
  findById(id: string): Promise<PresupuestoEntity | null>;

  /**
   * Retorna todos los presupuestos activos (deleted_at IS NULL) de un ticket_compra.
   */
  findByTicketCompraId(ticketCompraId: string): Promise<PresupuestoEntity[]>;

  /**
   * Retorna el presupuesto actualmente seleccionado para un ticket_compra.
   * Retorna null si ninguno está seleccionado (seleccionado = TRUE con deleted_at IS NULL).
   * Usado por SeleccionarPresupuestoUseCase para el swap atómico.
   */
  findSelectedByTicketCompraId(ticketCompraId: string): Promise<PresupuestoEntity | null>;

  /**
   * Persiste el presupuesto (upsert: crea si no existe, actualiza si existe).
   * Usado por SeleccionarPresupuestoUseCase para el swap atómico de seleccionado.
   */
  save(presupuesto: PresupuestoEntity): Promise<void>;

  /**
   * Baja lógica del presupuesto (soft delete). NO elimina la fila.
   */
  delete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para IPresupuestoRepository en NestJS. */
export const PRESUPUESTO_REPOSITORY = Symbol('PRESUPUESTO_REPOSITORY');
