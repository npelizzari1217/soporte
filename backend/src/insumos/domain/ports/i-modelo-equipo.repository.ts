import { ModeloEquipoEntity } from '../entities/modelo-equipo.entity';

/**
 * IModeloEquipoRepository — puerto de acceso al catálogo de modelos de equipo
 * del tenant.
 */
export interface IModeloEquipoRepository {
  /** Busca un modelo por id. Retorna null si no existe (incl. soft-deleted). */
  findById(id: string): Promise<ModeloEquipoEntity | null>;

  /**
   * Busca un modelo por su identidad de catálogo: el PAR completo. La marca
   * llega YA normalizada (`trim().toUpperCase()`) y el modelo YA recortado
   * (`trim()`, sin gritar) desde la capa de aplicación — el repositorio no
   * normaliza.
   *
   * @param marca Marca normalizada en mayúscula.
   * @param modelo Designación comercial recortada, con sus mayúsculas y minúsculas.
   */
  findByMarcaModelo(marca: string, modelo: string): Promise<ModeloEquipoEntity | null>;

  /**
   * Retorna los modelos vigentes del tenant: excluye los que tienen baja
   * lógica, pero INCLUYE los deshabilitados (`activo: false`) — son los que el
   * administrador necesita ver para volver a habilitarlos.
   */
  findAllActive(): Promise<ModeloEquipoEntity[]>;

  /** Upsert por id: INSERT si es nuevo, UPDATE si ya existe. */
  save(modelo: ModeloEquipoEntity): Promise<void>;
}

/** Token de inyección de dependencias para IModeloEquipoRepository en NestJS. */
export const MODELO_EQUIPO_REPOSITORY = Symbol('MODELO_EQUIPO_REPOSITORY');
