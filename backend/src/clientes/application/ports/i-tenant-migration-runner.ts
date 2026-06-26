/**
 * ITenantMigrationRunner — puerto para aplicar migraciones sobre una DB tenant.
 *
 * La implementación concreta (fan-out runner via `prisma migrate deploy`) vive
 * en Fase 7.B (script de migraciones). Este puerto permite que el use case
 * de provisioning dependa de una abstracción, no de la implementación concreta.
 *
 * Contrato de implementación (OBLIGATORIO):
 *   Las implementaciones DEBEN cerrar todas las conexiones a la DB tenant
 *   antes de retornar (sea con éxito o con error). Esto es esencial para
 *   que el rollback compensatorio pueda ejecutar DROP DATABASE sin errores
 *   por "conexiones activas" (pg no permite DROP si hay conexiones abiertas).
 *
 * Ref spec: [SPEC:clientes/Provisioning de tenant nuevo — migraciones tenant]
 * Tarea: 7.A.3 (puerto) / 7.B.2 (implementación concreta)
 */
export interface ITenantMigrationRunner {
  /**
   * Aplica todas las migraciones pendientes del schema tenant sobre la DB indicada.
   * Idempotente: Prisma `migrate deploy` no re-aplica migraciones ya aplicadas.
   *
   * @param dbName  Nombre de la DB tenant sobre la que aplicar migraciones.
   * @throws Error si las migraciones fallan. La implementación DEBE cerrar
   *         las conexiones antes de lanzar el error.
   */
  runMigrations(dbName: string): Promise<void>;
}

/** Token de inyección de dependencias para ITenantMigrationRunner en NestJS. */
export const TENANT_MIGRATION_RUNNER = Symbol('TENANT_MIGRATION_RUNNER');
