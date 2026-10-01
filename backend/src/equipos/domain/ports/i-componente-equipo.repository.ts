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
   * Edita los datos propios del componente (CAS, baja-equipo-completo ADR-5): escribe SOLO
   * `descripcion`, `numeroSerie`, `capacidad` y `updatedAt` con
   * `updateMany ... WHERE id = ? AND deleted_at IS NULL`. Devuelve `true` si tocó la fila y
   * `false` si el componente ya está retirado (o no existe): una entidad leída antes de una baja
   * del equipo o de un retiro individual no puede pisar `deleted_at` ni los `baja_*`.
   */
  editar(componente: ComponenteEquipoEntity): Promise<boolean>;

  /**
   * Marca el retiro del componente: escribe deleted_at y las columnas de retiro
   * con `updateMany ... WHERE id = ? AND deleted_at IS NULL`. Devuelve `true` si
   * tocó la fila y `false` si ya estaba retirada: es la exclusión mutua entre
   * dos retiros concurrentes.
   */
  retirar(componente: ComponenteEquipoEntity): Promise<boolean>;
}

/** Token de inyección de dependencias para IComponenteEquipoRepository en NestJS. */
export const COMPONENTE_EQUIPO_REPOSITORY = Symbol('COMPONENTE_EQUIPO_REPOSITORY');
