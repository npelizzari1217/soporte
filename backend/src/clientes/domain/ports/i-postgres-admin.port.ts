/**
 * IPostgresAdminPort — puerto de administración de bases de datos físicas
 * Postgres (crear/borrar/verificar existencia de una DB tenant completa).
 *
 * Definido en la capa de dominio: sin imports de `pg` ni NestJS.
 * La implementación concreta (`PostgresAdminService`, conexión a la DB de
 * mantenimiento `postgres`) vive en `clientes/infrastructure/`.
 *
 * Contrato (R17, R18 — spec `sdd/auth-multitenancy/spec`):
 * - `createDatabase`/`dropDatabase` son operaciones DESTRUCTIVAS sobre la
 *   instancia Postgres compartida — el paso `createDatabase` del flujo de
 *   provisioning (R16) exige confirmación humana explícita ANTES de que el
 *   apply lo ejecute (gate a nivel de proceso, no de este puerto).
 * - El identificador de DB MUST ir quoted (anti SQL-injection) — Postgres no
 *   soporta parámetros bindeados ($1) para nombres de DDL, así que la
 *   implementación MUST validar el formato del nombre antes de interpolarlo.
 * - `dropDatabase` MUST ser IF EXISTS (usado también como compensación de
 *   rollback, R18 — no debe fallar si la DB nunca llegó a crearse).
 *
 * Tarea: T7.1 / T7.2 (PR7 — Provisioning: ports + adapters)
 */
export interface IPostgresAdminPort {
  /** Crea una base de datos física nueva. Falla si ya existe. */
  createDatabase(dbName: string): Promise<void>;

  /** Borra una base de datos física. No falla si no existe (IF EXISTS). */
  dropDatabase(dbName: string): Promise<void>;

  /** Verifica si una base de datos física existe en la instancia. */
  databaseExists(dbName: string): Promise<boolean>;
}

/** Token de inyección de dependencias para IPostgresAdminPort en NestJS. */
export const POSTGRES_ADMIN_PORT = Symbol('POSTGRES_ADMIN_PORT');
