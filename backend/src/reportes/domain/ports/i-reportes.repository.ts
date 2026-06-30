/**
 * IReportesRepository — puerto de solo lectura para agregaciones sobre tickets del tenant.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La implementación concreta vive en reportes/infrastructure/persistence/prisma/.
 *
 * Invariantes:
 * - Todos los métodos son read-only: cero INSERT/UPDATE/DELETE.
 * - Todos los métodos operan sobre el tenant resuelto por TenantContext.
 * - Los tickets soft-deleted (deleted_at IS NOT NULL) son excluidos siempre.
 * - El parámetro cicloId debe corresponder a un ciclo del tenant activo.
 *
 * Decisión de diseño (D3, PR4 tasks):
 * - ticketsPorTipo y ticketsPorEstado retornan TODOS los entries del catálogo
 *   (incluso con total=0) mediante LEFT JOIN en la capa de infraestructura.
 *   Esto simplifica los use cases (no necesitan merge manual).
 * - ticketsPorSolicitante y ticketsPorAsignado retornan solo UUIDs (IDs).
 *   El enriquecimiento con nombres ocurre en la capa de aplicación via
 *   una query separada al master (IUsuarioRepository). Sin JOIN cross-DB.
 *
 * Tarea: T4.1 (PR4, admin-general)
 */

/** Resultado de agregación por solicitante — solo ID; nombre enriquecido en app layer. */
export interface TicketsPorSolicitanteRow {
  solicitanteId: string;
  total: number;
}

/** Resultado de agregación por asignado — null = sin asignar. */
export interface TicketsPorAsignadoRow {
  asignadoId: string | null;
  total: number;
}

/** Resultado de agregación por tipo de ticket — código del tipo (SOPORTE/COMPRAS/EDILICIA). */
export interface TicketsPorTipoRow {
  tipoCodigo: string;
  total: number;
}

/** Resultado de agregación por estado — código del estado. */
export interface TicketsPorEstadoRow {
  estadoCodigo: string;
  total: number;
}

/** Resultado del tiempo promedio de resolución en días. */
export interface TiempoResolucionResult {
  /** Promedio en días. Null si no hay tickets resueltos con fecha_cierre. */
  promedioDias: number | null;
  /** Cantidad de tickets incluidos en el cálculo (RESUELTO + SIN_SOLUCION, con fecha_cierre). */
  totalResueltos: number;
}

export interface IReportesRepository {
  /**
   * Tickets agrupados por solicitante_id en el ciclo dado.
   * Excluye soft-deleted. Retorna solo usuarios que tienen al menos 1 ticket.
   * El app layer enriquece con nombres via master.usuarios.
   */
  ticketsPorSolicitante(cicloId: string): Promise<TicketsPorSolicitanteRow[]>;

  /**
   * Tickets agrupados por asignado_id en el ciclo dado.
   * Excluye soft-deleted. null = tickets sin asignar (agrupados bajo null).
   * El app layer enriquece con nombres via master.usuarios para los no-null.
   */
  ticketsPorAsignado(cicloId: string): Promise<TicketsPorAsignadoRow[]>;

  /**
   * Tickets agrupados por tipo (codigo). Siempre incluye los 3 tipos:
   * SOPORTE, COMPRAS, EDILICIA — con total=0 si no hay tickets en ese tipo.
   * Excluye soft-deleted.
   */
  ticketsPorTipo(cicloId: string): Promise<TicketsPorTipoRow[]>;

  /**
   * Tickets agrupados por estado (codigo). Incluye TODOS los estados del catálogo
   * del tenant (incluyendo terminales: RESUELTO, SIN_SOLUCION, RECHAZADO) con
   * total=0 si no hay tickets en ese estado.
   * Excluye soft-deleted.
   */
  ticketsPorEstado(cicloId: string): Promise<TicketsPorEstadoRow[]>;

  /**
   * Tiempo promedio de resolución en días para tickets RESUELTO o SIN_SOLUCION.
   * Excluye RECHAZADO (nunca fueron trabajados — distorsionan el promedio).
   * Solo incluye tickets con fecha_cierre IS NOT NULL.
   * Calcula: AVG(fecha_cierre - created_at::date) días.
   */
  tiempoResolucionPromedioDias(cicloId: string): Promise<TiempoResolucionResult>;

  /**
   * Retorna el ID del ciclo activo del tenant (ciclos_cliente.activo=TRUE),
   * o null si no existe ninguno.
   * Usado por los use cases como fallback cuando no se provee cicloId.
   */
  cicloActivo(): Promise<string | null>;
}

/** Token de inyección de dependencias para IReportesRepository en NestJS. */
export const REPORTES_REPOSITORY = Symbol('REPORTES_REPOSITORY');
