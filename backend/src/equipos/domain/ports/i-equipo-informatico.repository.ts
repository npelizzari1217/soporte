import { EquipoInformaticoEntity } from '../entities/equipo-informatico.entity';

/**
 * IEquipoInformaticoRepository — puerto de persistencia para el inventario
 * de equipos IT (F3-Q1).
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS. La
 * implementación concreta (`PrismaEquipoInformaticoRepository`, PR11)
 * obtiene su cliente vía `TenantContext.getClient()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1. Ref design: "Firmas TS
 * clave" (ports/*). Tarea: T10.6.
 */
export interface IEquipoInformaticoRepository {
  /** Busca el equipo por su identificador técnico (UUIDv7). Incluye soft-deleted. */
  findById(id: string): Promise<EquipoInformaticoEntity | null>;

  /**
   * Busca el equipo por `numeroSerie`. Retorna `null` si no existe.
   * Usado para validar unicidad (índice único parcial `WHERE NOT NULL`)
   * antes de crear/editar.
   */
  findByNumeroSerie(numeroSerie: string): Promise<EquipoInformaticoEntity | null>;

  /** Retorna todos los equipos activos (`activo=true`, no soft-deleted) del tenant. */
  findAllActive(): Promise<EquipoInformaticoEntity[]>;

  /** Persiste el equipo (upsert: crea si no existe, actualiza si existe). */
  save(equipo: EquipoInformaticoEntity): Promise<void>;

  /** Baja lógica (soft delete) del equipo por id. */
  delete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para IEquipoInformaticoRepository en NestJS. */
export const EQUIPO_INFORMATICO_REPOSITORY = Symbol('EQUIPO_INFORMATICO_REPOSITORY');
