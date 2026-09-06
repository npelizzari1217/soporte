import { UnidadMedidaEntity } from '../entities/unidad-medida.entity';

/**
 * IUnidadMedidaRepository — puerto de acceso al catálogo de unidades de medida
 * del tenant.
 */
export interface IUnidadMedidaRepository {
  /** Busca una unidad por id. Retorna null si no existe (incl. soft-deleted). */
  findById(id: string): Promise<UnidadMedidaEntity | null>;

  /**
   * Busca una unidad por su código semántico. Retorna null si no existe.
   * El código llega YA normalizado (`trim().toUpperCase()`) desde la capa de
   * aplicación — el repositorio no normaliza.
   */
  findByCodigo(codigo: string): Promise<UnidadMedidaEntity | null>;

  /**
   * Retorna las unidades vigentes del tenant: excluye las que tienen baja
   * lógica, pero INCLUYE las deshabilitadas (`activo: false`) — son las que el
   * administrador necesita ver para volver a habilitarlas.
   */
  findAllActive(): Promise<UnidadMedidaEntity[]>;

  /** Upsert por id: INSERT si es nueva, UPDATE si ya existe. */
  save(unidad: UnidadMedidaEntity): Promise<void>;
}

/** Token de inyección de dependencias para IUnidadMedidaRepository en NestJS. */
export const UNIDAD_MEDIDA_REPOSITORY = Symbol('UNIDAD_MEDIDA_REPOSITORY');
