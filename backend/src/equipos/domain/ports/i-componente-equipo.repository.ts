import { ComponenteEquipoEntity } from '../entities/componente-equipo.entity';

/**
 * IComponenteEquipoRepository — puerto de persistencia para los componentes
 * físicos de un equipo (F3-Q2).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q2. Ref design: "Firmas TS
 * clave" (ports/*). Tarea: T10.6.
 */
export interface IComponenteEquipoRepository {
  /** Busca el componente por su identificador técnico. Incluye soft-deleted. */
  findById(id: string): Promise<ComponenteEquipoEntity | null>;

  /** Retorna los componentes ACTIVOS (no soft-deleted) de un equipo. Permite N por tipo (F3-Q2). */
  findActiveByEquipoId(equipoId: string): Promise<ComponenteEquipoEntity[]>;

  /**
   * Retorna TODOS los componentes de un equipo (activos + soft-deleted) —
   * usado por `ObtenerEquipoUseCase` para mostrar el historial completo en
   * el detalle del equipo (listado enriquecido, item "componentes de equipo").
   */
  findAllByEquipoId(equipoId: string): Promise<ComponenteEquipoEntity[]>;

  /** Persiste el componente (upsert). */
  save(componente: ComponenteEquipoEntity): Promise<void>;

  /**
   * Marca el retiro del componente: escribe deleted_at y las columnas de retiro
   * con `updateMany ... WHERE id = ? AND deleted_at IS NULL`. Devuelve `true` si
   * tocó la fila y `false` si ya estaba retirada: es la exclusión mutua entre
   * dos retiros concurrentes.
   */
  retirar(componente: ComponenteEquipoEntity): Promise<boolean>;

  /**
   * Baja lógica (soft delete) del componente por id.
   *
   * @deprecated Se retira en WU-8b junto con `EliminarComponenteUseCase`, su
   *   único llamador; el retiro con destino lo reemplaza (`retirar`).
   */
  delete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para IComponenteEquipoRepository en NestJS. */
export const COMPONENTE_EQUIPO_REPOSITORY = Symbol('COMPONENTE_EQUIPO_REPOSITORY');
