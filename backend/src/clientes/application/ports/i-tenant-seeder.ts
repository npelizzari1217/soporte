/**
 * ITenantSeeder — puerto para sembrar los catálogos operativos en una DB tenant.
 *
 * La implementación concreta wrappea `prisma_tenant/seeds/tenant-seed.ts`,
 * que siembra los 5 catálogos base: estados, prioridades, tipos_ticket,
 * tipo_operacion, tipos_componente.
 *
 * Contrato de implementación (OBLIGATORIO):
 *   - Idempotente: usar `INSERT ... ON CONFLICT DO NOTHING` (ya garantizado
 *     por tenant-seed.ts). Llamar a `seed()` sobre una DB ya sembrada no debe
 *     producir errores ni duplicados.
 *   - Las implementaciones DEBEN cerrar todas las conexiones a la DB tenant
 *     antes de retornar (sea con éxito o con error). Esto es esencial para
 *     que el rollback compensatorio pueda ejecutar DROP DATABASE sin errores
 *     por "conexiones activas".
 *
 * Ref spec: [SPEC:clientes/Seed de catálogos por tenant es idempotente]
 * Tarea: 7.A.3 (puerto) / 7.B (implementación concreta via tenant-seed.ts)
 */
export interface ITenantSeeder {
  /**
   * Siembra los catálogos operativos base en la DB tenant indicada.
   * Idempotente: seguro de ejecutar múltiples veces sobre la misma DB.
   *
   * @param dbName  Nombre de la DB tenant a sembrar.
   * @throws Error si el seed falla. La implementación DEBE cerrar
   *         las conexiones antes de lanzar el error.
   */
  seed(dbName: string): Promise<void>;
}

/** Token de inyección de dependencias para ITenantSeeder en NestJS. */
export const TENANT_SEEDER = Symbol('TENANT_SEEDER');
