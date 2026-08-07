import { CicloClienteEntity } from '../entities/ciclo-cliente.entity';

/**
 * ICicloClienteRepository — puerto de persistencia para los ciclos de
 * gestión del tenant.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS. La
 * implementación concreta (`PrismaCicloClienteRepository`, PR5) obtiene su
 * PrismaClient desde `TenantContext.getClient()`.
 *
 * Ref spec: sdd/tickets-core/spec T4, T7. Ref design: "Archivos afectados"
 * PR5. Tarea: T5.6.
 */
export interface ICicloClienteRepository {
  /**
   * Busca un ciclo por su identificador técnico. Retorna null si no
   * existe. Incluye ciclos soft-deleted.
   */
  findById(id: string): Promise<CicloClienteEntity | null>;

  /**
   * Retorna el ciclo ACTIVO del tenant (`activo=true`, `deleted_at IS
   * NULL`). Retorna null si no hay ninguno — `ResolverCicloActivoParaCreacion`
   * traduce esto a `SinCicloActivoError` (T4).
   */
  findActive(): Promise<CicloClienteEntity | null>;

  /** Retorna todos los ciclos del tenant, incluyendo inactivos y soft-deleted. */
  findAll(): Promise<CicloClienteEntity[]>;

  /** Persiste el ciclo (upsert: crea si no existe, actualiza si existe). */
  save(ciclo: CicloClienteEntity): Promise<void>;
}

/** Token de inyección de dependencias para ICicloClienteRepository en NestJS. */
export const CICLO_CLIENTE_REPOSITORY = Symbol('CICLO_CLIENTE_REPOSITORY');
