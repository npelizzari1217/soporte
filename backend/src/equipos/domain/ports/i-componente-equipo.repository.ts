import { ComponenteEquipoEntity } from '../entities/componente-equipo.entity';

/**
 * IComponenteEquipoRepository — puerto de persistencia para componentes de equipo.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La implementación concreta vive en infrastructure/persistence/prisma/.
 * El repositorio opera dentro del tenant activo (client desde TenantContext).
 *
 * Ref spec: [SPEC:equipos/Tabla componentes_equipo]
 * Tarea: 6.A.3
 */
export interface IComponenteEquipoRepository {
  /**
   * Busca un componente por su identificador técnico (UUIDv7).
   * Retorna null si no existe. Incluye componentes soft-deleted.
   */
  findById(id: string): Promise<ComponenteEquipoEntity | null>;

  /**
   * Retorna todos los componentes activos de un equipo (deleted_at IS NULL).
   *
   * @param equipoId UUID del equipo propietario.
   */
  findByEquipoId(equipoId: string): Promise<ComponenteEquipoEntity[]>;

  /**
   * Persiste el componente (upsert: crea si no existe, actualiza si existe).
   */
  save(componente: ComponenteEquipoEntity): Promise<void>;

  /**
   * Baja lógica del componente (soft delete).
   * NO elimina la fila — setea deleted_at.
   * El equipo y los demás componentes permanecen sin cambios.
   */
  delete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para IComponenteEquipoRepository en NestJS. */
export const COMPONENTE_EQUIPO_REPOSITORY = Symbol('COMPONENTE_EQUIPO_REPOSITORY');
