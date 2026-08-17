import { SectorEntity } from '../entities/sector.entity';

/**
 * ISectorRepository — puerto de acceso al catálogo de sectores del tenant
 * (WU-04, sdd/compras-tres-etapas-y-sectores/spec R10).
 */
export interface ISectorRepository {
  /** Busca un sector por id. Retorna null si no existe (incl. soft-deleted). */
  findById(id: string): Promise<SectorEntity | null>;

  /** Busca un sector por su código semántico. Retorna null si no existe. */
  findByCodigo(codigo: string): Promise<SectorEntity | null>;

  /** Retorna todos los sectores activos (no soft-deleted) del tenant. */
  findAllActive(): Promise<SectorEntity[]>;

  /** Upsert por id: INSERT si es nuevo, UPDATE si ya existe. */
  save(sector: SectorEntity): Promise<void>;
}

/** Token de inyección de dependencias para ISectorRepository en NestJS. */
export const SECTOR_REPOSITORY = Symbol('SECTOR_REPOSITORY');
