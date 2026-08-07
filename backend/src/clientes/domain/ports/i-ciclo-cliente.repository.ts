import { CicloClienteEntity } from '../entities/ciclo-cliente.entity';

/**
 * ICicloClienteRepository — puerto de persistencia para `CicloClienteEntity`
 * (ciclos adoptados por el tenant, vive en la DB del tenant activo).
 *
 * El tenant activo se resuelve vía `TenantContext` (inyectado en la
 * implementación) — no hay `clienteId` en los parámetros, el `TenantGuard`
 * ya garantiza el aislamiento (R12/R15).
 *
 * Tarea: T9.4 / T9.5 / T9.6 (PR9 — Ciclos)
 */
export interface ICicloClienteRepository {
  /**
   * Busca un ciclo por su id en el tenant activo. Retorna `null` si no
   * existe (incluye ciclos de otros tenants — no existen en esta DB).
   */
  findById(id: string): Promise<CicloClienteEntity | null>;

  /**
   * Retorna los ciclos del tenant activo con `activo=true` y `deletedAt=null`
   * — usado por `ElegirCicloTenantUseCase` para validar solapamiento (R21).
   */
  findActivos(): Promise<CicloClienteEntity[]>;

  /**
   * Retorna TODOS los ciclos adoptados del tenant activo, incluyendo
   * inactivos y soft-deleted, ordenados por `fechaInicio` DESC. Usado por
   * `ListarCiclosUseCase` (`GET /ciclos`, G4 — sdd/beta-frontend/spec §3)
   * para poblar el filtro de ciclo y la vista de administración de ciclos.
   */
  findAll(): Promise<CicloClienteEntity[]>;

  /** Persiste un ciclo nuevo en el tenant activo (upsert por id). */
  save(ciclo: CicloClienteEntity): Promise<void>;

  /**
   * Activa el ciclo `id` y desactiva TODOS los demás del tenant en una única
   * transacción atómica (R22: máximo un `activo=true` por tenant).
   *
   * Retorna `false` si el ciclo no fue encontrado (el caso de uso llama
   * `findById` antes para garantizar existencia — esto cubre solo la
   * carrera extrema entre el `findById` y la transacción).
   */
  activarCiclo(id: string): Promise<boolean>;
}

/** Token de inyección de dependencias para ICicloClienteRepository en NestJS. */
export const CICLO_CLIENTE_REPOSITORY = Symbol('CICLO_CLIENTE_REPOSITORY');
