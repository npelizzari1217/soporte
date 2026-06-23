import { CicloClienteEntity } from '../entities/ciclo-cliente.entity';

/**
 * ICicloClienteRepository — puerto de persistencia para ciclos de gestión del tenant.
 *
 * Los ciclos referencian master.ciclos_vigentes via soft ref (cicloVigenteId).
 * El repositorio opera dentro del tenant activo (client desde TenantContext).
 *
 * Ref spec: [SPEC:tickets-core/Tabla ciclos_cliente]
 * Tarea: 3.A.3
 */
export interface ICicloClienteRepository {
  /**
   * Busca un ciclo por su identificador técnico.
   * Retorna null si no existe. Incluye ciclos soft-deleted.
   */
  findById(id: string): Promise<CicloClienteEntity | null>;

  /**
   * Retorna el ciclo activo del tenant (activo=true, deleted_at IS NULL).
   * Retorna null si no hay ciclo activo.
   */
  findActive(): Promise<CicloClienteEntity | null>;

  /**
   * Retorna todos los ciclos del tenant, incluyendo inactivos y soft-deleted.
   */
  findAll(): Promise<CicloClienteEntity[]>;

  /**
   * Persiste el ciclo (upsert: crea si no existe, actualiza si existe).
   */
  save(ciclo: CicloClienteEntity): Promise<void>;
}

/** Token de inyección de dependencias para ICicloClienteRepository en NestJS. */
export const CICLO_CLIENTE_REPOSITORY = Symbol('CICLO_CLIENTE_REPOSITORY');
