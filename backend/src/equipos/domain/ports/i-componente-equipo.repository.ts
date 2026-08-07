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

  /** Persiste el componente (upsert). */
  save(componente: ComponenteEquipoEntity): Promise<void>;

  /** Baja lógica (soft delete) del componente por id. */
  delete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para IComponenteEquipoRepository en NestJS. */
export const COMPONENTE_EQUIPO_REPOSITORY = Symbol('COMPONENTE_EQUIPO_REPOSITORY');
