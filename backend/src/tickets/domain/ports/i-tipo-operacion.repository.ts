import { TipoOperacionEntity } from '../entities/tipo-operacion.entity';

/**
 * ITipoOperacionRepository — puerto de acceso al catálogo FIJO de tipos de
 * operación del tenant (5 códigos — eventos del timeline). Usado por los
 * use cases de application (PR7-PR10) para obtener el UUID del tipo de
 * operación antes de crear una `OperacionTicketEntity`.
 *
 * Ref spec: sdd/tickets-core/spec (Área A — Catálogos). Tarea: T2.1/T2.3
 */
export interface ITipoOperacionRepository {
  /**
   * Busca un tipo de operación por su código semántico (ej. "CAMBIO_ESTADO").
   * Retorna null si no existe.
   */
  findByCodigo(codigo: string): Promise<TipoOperacionEntity | null>;

  /**
   * Retorna el UUID de un tipo de operación dado su código semántico, sin
   * hidratar la entidad completa. Retorna null si el código no existe.
   */
  findIdByCodigo(codigo: string): Promise<string | null>;

  /**
   * Retorna todos los tipos de operación activos (no soft-deleted) del
   * tenant.
   */
  findAllActive(): Promise<TipoOperacionEntity[]>;
}

/** Token de inyección de dependencias para ITipoOperacionRepository en NestJS. */
export const TIPO_OPERACION_REPOSITORY = Symbol('TIPO_OPERACION_REPOSITORY');
