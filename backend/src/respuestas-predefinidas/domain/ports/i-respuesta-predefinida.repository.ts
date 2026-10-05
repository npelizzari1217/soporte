import { RespuestaPredefinidaEntity } from '../entities/respuesta-predefinida.entity';

/** IRespuestaPredefinidaRepository — puerto de acceso al catálogo de respuestas del tenant. */
export interface IRespuestaPredefinidaRepository {
  /** Busca por id. Retorna null si no existe. */
  findById(id: string): Promise<RespuestaPredefinidaEntity | null>;

  /**
   * Busca por título SIN distinguir mayúsculas, incluyendo desactivadas (mismo criterio que
   * el índice único sobre `lower(titulo)`). Retorna null si no existe.
   */
  findByTitulo(titulo: string): Promise<RespuestaPredefinidaEntity | null>;

  /** Lista el catálogo ordenado por título. Con `soloActivas` omite las desactivadas. */
  findAll(soloActivas: boolean): Promise<RespuestaPredefinidaEntity[]>;

  /** Upsert por id: INSERT si es nueva, UPDATE si ya existe. */
  save(respuesta: RespuestaPredefinidaEntity): Promise<void>;
}

/** Token de inyección de dependencias para IRespuestaPredefinidaRepository en NestJS. */
export const RESPUESTA_PREDEFINIDA_REPOSITORY = Symbol('RESPUESTA_PREDEFINIDA_REPOSITORY');
