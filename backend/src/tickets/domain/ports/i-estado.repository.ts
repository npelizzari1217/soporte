import { EstadoEntity } from '../entities/estado.entity';

/**
 * IEstadoRepository — puerto de acceso al catálogo de estados del tenant.
 *
 * Los estados son catálogo sembrado en provisioning. El repositorio opera
 * dentro del tenant activo (client desde TenantContext).
 *
 * Ref spec: [SPEC:tickets-core/Tabla estados]
 * Tarea: 3.A.3
 */
export interface IEstadoRepository {
  /**
   * Busca un estado por su identificador técnico.
   * Retorna null si no existe.
   */
  findById(id: string): Promise<EstadoEntity | null>;

  /**
   * Busca un estado por su código semántico (ej. "ABIERTO", "CERRADO").
   * Retorna null si no existe.
   */
  findByCodigo(codigo: string): Promise<EstadoEntity | null>;

  /**
   * Retorna todos los estados activos del tenant, ordenados por `orden` ASC.
   * Excluye estados soft-deleted.
   */
  findAllActive(): Promise<EstadoEntity[]>;

  /**
   * Retorna todos los estados del tenant, incluyendo inactivos.
   * Ordenados por `orden` ASC.
   */
  findAll(): Promise<EstadoEntity[]>;
}

/** Token de inyección de dependencias para IEstadoRepository en NestJS. */
export const ESTADO_REPOSITORY = Symbol('ESTADO_REPOSITORY');
