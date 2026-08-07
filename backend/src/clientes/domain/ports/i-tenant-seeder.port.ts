/**
 * ITenantSeeder — puerto que siembra los catálogos base de una DB tenant
 * recién migrada (estados, prioridades, tipo_operacion, tipos_ticket,
 * tipos_componente — este último agregado en Fase 3 ADR-5).
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La implementación concreta (`TenantSeederAdapter`) vive en
 * `clientes/infrastructure/`.
 *
 * Contrato (R19 — spec `sdd/auth-multitenancy/spec`; decisión #2025 sobre
 * `estados`, que reemplaza la lista original de R19):
 * - `seed` MUST ser idempotente: correrlo dos veces sobre la misma DB NO
 *   MUST producir duplicados ni errores (INSERT ... ON CONFLICT DO NOTHING
 *   por `codigo`).
 * - `seed` MUST cerrar todas sus conexiones a la DB tenant antes de retornar
 *   (mismo contrato que `ITenantMigrationRunner`, R18 — necesario para que
 *   un rollback posterior pueda dropear la DB).
 *
 * Tarea: T7.4 (PR7 — Provisioning: ports + adapters)
 */
export interface ITenantSeeder {
  /** Siembra los catálogos base de la DB tenant `dbName` (ya migrada). */
  seed(dbName: string): Promise<void>;
}

/** Token de inyección de dependencias para ITenantSeeder en NestJS. */
export const TENANT_SEEDER = Symbol('TENANT_SEEDER');
