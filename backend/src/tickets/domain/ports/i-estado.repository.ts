import { EstadoEntity } from '../entities/estado.entity';

/**
 * IEstadoRepository — puerto de acceso al catálogo de estados del tenant
 * (FIJO, 6 códigos, ADR-1). Solo lectura: ningún use case crea/modifica
 * estados directamente (spec T1: sin endpoints de alta/baja/edición).
 *
 * Ref spec: sdd/tickets-core/spec T1. Tarea: T2.1/T2.3
 */
export interface IEstadoRepository {
  /**
   * Busca un estado por su identificador técnico (UUID). Retorna null si no
   * existe.
   *
   * Usado por `TransicionarEstadoUseCase` (PR7, T12) para resolver el
   * código semántico del estado ACTUAL del ticket (`ticket.estadoId` es un
   * UUID; la máquina de estados y `canTransitionTo` trabajan con códigos).
   * Extensión de PR7 sobre el puerto original de PR2 (solo `findByCodigo`),
   * mismo patrón que `ITipoTicketRepository.findById`/`IPrioridadRepository.findById`
   * (PR6). Cambio no-breaking.
   */
  findById(id: string): Promise<EstadoEntity | null>;

  /**
   * Busca un estado por su código semántico (ej. "NUEVO", "CERRADO").
   * Retorna null si no existe.
   */
  findByCodigo(codigo: string): Promise<EstadoEntity | null>;

  /**
   * Retorna el UUID de un estado dado su código semántico, sin hidratar la
   * entidad completa. Retorna null si el código no existe.
   */
  findIdByCodigo(codigo: string): Promise<string | null>;

  /**
   * Retorna todos los estados activos (no soft-deleted) del tenant,
   * ordenados por `orden` ASC.
   */
  findAllActive(): Promise<EstadoEntity[]>;
}

/** Token de inyección de dependencias para IEstadoRepository en NestJS. */
export const ESTADO_REPOSITORY = Symbol('ESTADO_REPOSITORY');
