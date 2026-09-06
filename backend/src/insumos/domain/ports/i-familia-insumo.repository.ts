import { FamiliaInsumoEntity } from '../entities/familia-insumo.entity';

/**
 * IFamiliaInsumoRepository — puerto de acceso al catálogo de familias de
 * insumo del tenant.
 */
export interface IFamiliaInsumoRepository {
  /** Busca una familia por id. Retorna null si no existe (incl. soft-deleted). */
  findById(id: string): Promise<FamiliaInsumoEntity | null>;

  /**
   * Busca una familia por su código semántico. Retorna null si no existe.
   * El código llega YA normalizado (`trim().toUpperCase()`) desde la capa de
   * aplicación — el repositorio no normaliza.
   */
  findByCodigo(codigo: string): Promise<FamiliaInsumoEntity | null>;

  /**
   * Retorna las familias vigentes del tenant: excluye las que tienen baja
   * lógica, pero INCLUYE las deshabilitadas (`activo: false`) — son las que el
   * administrador necesita ver para volver a habilitarlas.
   */
  findAllActive(): Promise<FamiliaInsumoEntity[]>;

  /** Upsert por id: INSERT si es nueva, UPDATE si ya existe. */
  save(familia: FamiliaInsumoEntity): Promise<void>;
}

/** Token de inyección de dependencias para IFamiliaInsumoRepository en NestJS. */
export const FAMILIA_INSUMO_REPOSITORY = Symbol('FAMILIA_INSUMO_REPOSITORY');
