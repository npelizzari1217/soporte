import { CicloClienteEntity } from '../entities/ciclo-cliente.entity';

/**
 * ICicloClienteRepository (admin) — puerto de persistencia para ciclos del tenant
 * en el contexto de las operaciones de administración.
 *
 * DISTINTO del ICicloClienteRepository en tickets/domain:
 * - Ese puerto es para la asignación de tickets (findActive, findById, findAll, save).
 * - Este puerto es para las operaciones ADMIN: listar, crear, activar un ciclo.
 *
 * El tenant activo se resuelve via TenantContext (inyectado en la implementación).
 * No hay tenant_id en los parámetros — el TenantGuard garantiza el aislamiento.
 *
 * Tarea: T2.6
 */
export interface ICicloClienteRepository {
  /**
   * Retorna todos los ciclos del tenant activo, incluyendo los inactivos.
   * NO incluye ciclos con deleted_at IS NOT NULL (soft-deleted).
   */
  findAll(): Promise<CicloClienteEntity[]>;

  /**
   * Busca un ciclo por su ID en el tenant activo.
   * Retorna null si no existe (o pertenece a otro tenant — aislamiento por TenantContext).
   */
  findById(id: string): Promise<CicloClienteEntity | null>;

  /**
   * Retorna el ciclo activo (`activo=true`, `deletedAt=null`) del tenant resuelto,
   * o `null` si no hay ninguno. Usado por `ObtenerCicloActivoUseCase` (ADR-8).
   */
  findActive(): Promise<CicloClienteEntity | null>;

  /**
   * Persiste un nuevo ciclo en el tenant activo.
   * El ID debe ser generado antes de llamar a este método (BaseEntity.id).
   */
  save(ciclo: CicloClienteEntity): Promise<void>;

  /**
   * Activa el ciclo con el id dado y desactiva TODOS los demás del tenant
   * en una única transacción atómica.
   *
   * Garantías:
   * - Si el ciclo no existe → retorna false (caller lanza NotFoundException).
   * - UPDATE ciclos_cliente SET activo=false WHERE NOT id AND deleted_at IS NULL
   * - UPDATE ciclos_cliente SET activo=true WHERE id
   * - Ambas operaciones en prisma.$transaction([...]).
   */
  activarCiclo(id: string): Promise<boolean>;
}

/** Token de inyección de dependencias para ICicloClienteRepository admin en NestJS. */
export const CICLO_CLIENTE_ADMIN_REPOSITORY = Symbol('CICLO_CLIENTE_ADMIN_REPOSITORY');
