/**
 * ITenantMigrationRunner — puerto que aplica las migraciones del schema
 * TENANT (`prisma_tenant/`) sobre una base de datos física recién creada.
 *
 * Definido en la capa de dominio: sin imports de `child_process` ni NestJS.
 * La implementación concreta (`TenantMigrationRunnerAdapter`, invoca
 * `prisma migrate deploy` como subproceso) vive en `clientes/infrastructure/`.
 *
 * Contrato (R18 — spec `sdd/auth-multitenancy/spec`):
 * - `run` MUST cerrar todas sus conexiones a la DB tenant antes de retornar
 *   (sin conexiones activas) — si el paso posterior falla y dispara el
 *   rollback (`dropDatabase`), Postgres rechaza el DROP mientras haya
 *   sesiones abiertas contra esa DB.
 *
 * Tarea: T7.3 (PR7 — Provisioning: ports + adapters)
 */
export interface ITenantMigrationRunner {
  /**
   * Aplica todas las migraciones pendientes del schema tenant sobre la DB
   * `dbName` (que ya debe existir físicamente, ver `IPostgresAdminPort`).
   */
  run(dbName: string): Promise<void>;
}

/** Token de inyección de dependencias para ITenantMigrationRunner en NestJS. */
export const TENANT_MIGRATION_RUNNER = Symbol('TENANT_MIGRATION_RUNNER');
