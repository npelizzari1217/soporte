import { CicloVigenteEntity } from '../entities/ciclo-vigente.entity';

/**
 * ICicloVigenteRepository — puerto de persistencia para CicloVigenteEntity.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La implementación concreta vive en infrastructure/persistence/prisma/.
 *
 * Tarea: 1.A.3
 */
export interface ICicloVigenteRepository {
  /**
   * Busca un ciclo vigente por su identificador técnico (UUIDv7).
   * Retorna null si no existe.
   */
  findById(id: string): Promise<CicloVigenteEntity | null>;

  /**
   * Retorna todos los ciclos vigentes que NO fueron eliminados lógicamente
   * (deleted_at IS NULL). Usado en la validación de solapamiento de fechas:
   * los ciclos soft-deleted NO cuentan para la validación.
   */
  findAllNonDeleted(): Promise<CicloVigenteEntity[]>;

  /**
   * Retorna todos los ciclos vigentes (incluyendo soft-deleted).
   */
  findAll(): Promise<CicloVigenteEntity[]>;

  /**
   * Persiste el ciclo vigente (upsert).
   */
  save(ciclo: CicloVigenteEntity): Promise<void>;

  /**
   * Elimina físicamente un ciclo vigente por id.
   * Para la baja lógica, usar softDelete() + save().
   */
  delete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para ICicloVigenteRepository en NestJS. */
export const CICLO_VIGENTE_REPOSITORY = Symbol('CICLO_VIGENTE_REPOSITORY');
