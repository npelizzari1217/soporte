import { CicloVigenteEntity } from '../entities/ciclo-vigente.entity';

/**
 * ICicloVigenteRepository — puerto de persistencia para `CicloVigenteEntity`
 * (catálogo global de ciclos, vive en MASTER).
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 *
 * Tarea: T9.1 / T9.6 (PR9 — Ciclos)
 */
export interface ICicloVigenteRepository {
  /**
   * Busca un ciclo vigente por su identificador técnico (UUIDv7).
   * Retorna `null` si no existe. Ciclos soft-deleted SÍ son retornados — el
   * consumidor (`ElegirCicloTenantUseCase`, R21) filtra por
   * `activo`/`isDeleted()` para decidir elegibilidad.
   */
  findById(id: string): Promise<CicloVigenteEntity | null>;

  /** Persiste el ciclo vigente (upsert por id). */
  save(ciclo: CicloVigenteEntity): Promise<void>;

  /**
   * Retorna TODOS los ciclos ACTIVOS (`activo=true`, no soft-deleted) del
   * catálogo global, ordenados por `fechaInicio DESC`. Usado por
   * `GET /ciclos-vigentes` (sdd/beta-frontend item 4 — G6) para poblar el
   * selector de adopción del `AdoptarCicloForm` del tenant (antes texto
   * libre de UUID, sin catálogo).
   */
  findAllActivos(): Promise<CicloVigenteEntity[]>;

  /**
   * Retorna TODOS los ciclos del catálogo global, INCLUYENDO los
   * soft-deleted (mismo criterio que `findById` — el consumidor decide qué
   * hacer con `isDeleted()`), ordenados por `fechaInicio DESC`. Exclusivo
   * de `GET /ciclos-vigentes/admin` (ROOT, `sdd/ciclos-abm-root`): la
   * pantalla ABM del catálogo master necesita ver el historial completo
   * para poder editar/dar de baja, a diferencia de `findAllActivos()` que
   * solo sirve para poblar el selector de adopción del tenant.
   */
  findAll(): Promise<CicloVigenteEntity[]>;
}

/** Token de inyección de dependencias para ICicloVigenteRepository en NestJS. */
export const CICLO_VIGENTE_REPOSITORY = Symbol('CICLO_VIGENTE_REPOSITORY');
