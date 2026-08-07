import { TipoComponenteEntity } from '../entities/tipo-componente.entity';

/**
 * ITipoComponenteRepository — puerto de lectura para el catálogo READ-ONLY
 * de tipos de componente (F3-Q3, sembrado en PR1/ADR-5).
 *
 * Sin `save()`/`delete()`: el catálogo no es editable en Fase 3 (spec F3-Q3).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q3. Ref design: "Firmas TS
 * clave" (ports/*). Tarea: T10.6.
 */
export interface ITipoComponenteRepository {
  /** Busca el tipo por su identificador técnico. */
  findById(id: string): Promise<TipoComponenteEntity | null>;

  /** Busca el tipo por su código estable (ej. "RAM"). */
  findByCodigo(codigo: string): Promise<TipoComponenteEntity | null>;

  /** Retorna todos los tipos con `activo=true` (listado para selectores de UI). */
  findAllActive(): Promise<TipoComponenteEntity[]>;
}

/** Token de inyección de dependencias para ITipoComponenteRepository en NestJS. */
export const TIPO_COMPONENTE_REPOSITORY = Symbol('TIPO_COMPONENTE_REPOSITORY');
