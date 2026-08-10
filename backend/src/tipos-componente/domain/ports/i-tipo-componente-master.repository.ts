import { TipoComponente } from '../entities/tipo-componente.entity';

/**
 * ITipoComponenteMasterRepository — puerto de persistencia para
 * `TipoComponente` (catálogo MASTER de tipos de componente, vive en
 * `prisma_master`).
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 */
export interface ITipoComponenteMasterRepository {
  /** Busca un tipo de componente por su identificador técnico (UUIDv7). Retorna `null` si no existe. */
  findById(id: string): Promise<TipoComponente | null>;

  /**
   * Busca un tipo de componente por `codigo`. El caller es responsable de
   * normalizar (`trim().toUpperCase()`) antes de invocar — el repositorio
   * hace un lookup exacto, no normaliza.
   */
  findByCodigo(codigo: string): Promise<TipoComponente | null>;

  /** Retorna TODOS los tipos de componente del catálogo (activos e inactivos). */
  findAll(): Promise<TipoComponente[]>;

  /** Persiste el tipo de componente (upsert por id). */
  save(tipo: TipoComponente): Promise<void>;
}

/** Token de inyección de dependencias para ITipoComponenteMasterRepository en NestJS. */
export const TIPO_COMPONENTE_MASTER_REPOSITORY = Symbol('TIPO_COMPONENTE_MASTER_REPOSITORY');
