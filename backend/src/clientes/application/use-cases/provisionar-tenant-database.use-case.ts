import { IPostgresAdminPort } from '../../domain/ports/i-postgres-admin.port';
import { ITenantMigrationRunner } from '../../domain/ports/i-tenant-migration-runner.port';
import { ITenantSeeder } from '../../domain/ports/i-tenant-seeder.port';

/**
 * ProvisionarTenantDatabaseUseCase — orquesta el aprovisionamiento físico de
 * una DB tenant: `createDatabase` → `migrate` → `seed`, con rollback
 * compensatorio ante cualquier fallo posterior a la creación (R18).
 *
 * Pieza reutilizable de infraestructura de bajo nivel: NO inserta en
 * `master.clientes` ni crea el usuario admin+membresía — eso es
 * responsabilidad de `CrearClienteUseCase` (PR8, R16), que consumirá este
 * use case como un paso más de su propia orquestación. Se aísla acá porque
 * el rollback (R18) es una responsabilidad completa y testeable por sí
 * misma, independiente del resto del flujo de alta de cliente.
 *
 * Contrato (R18):
 * - Si `run` (migración) o `seed` fallan, MUST ejecutar
 *   `postgresAdmin.dropDatabase(dbName)` como compensación y re-lanzar el
 *   error ORIGINAL (sin envolverlo) — el caller necesita el error real para
 *   decidir cómo responder (ej. 500 vs 409).
 * - Si `createDatabase` falla, NO hay nada que compensar (el propio paso
 *   que falló es la creación) — no se llama dropDatabase.
 * - `ITenantMigrationRunner`/`ITenantSeeder` garantizan cerrar sus propias
 *   conexiones antes de retornar (contrato de esos puertos) — condición
 *   necesaria para que el `dropDatabase` de compensación no falle por
 *   sesiones activas.
 *
 * Ref spec: sdd/auth-multitenancy/spec §R16, §R18
 * Ref design: sdd/auth-multitenancy/design ADR-6
 * Tarea: PR7 (orquestación de rollback, alcance explícito del batch)
 */
export class ProvisionarTenantDatabaseUseCase {
  constructor(
    private readonly postgresAdmin: IPostgresAdminPort,
    private readonly migrationRunner: ITenantMigrationRunner,
    private readonly seeder: ITenantSeeder,
  ) {}

  /**
   * Crea, migra y siembra la DB física del tenant `dbName`.
   * @throws el error original de `run`/`seed` tras compensar con `dropDatabase`.
   *   Propaga sin compensar si `createDatabase` es quien falla.
   */
  async provision(dbName: string): Promise<void> {
    await this.postgresAdmin.createDatabase(dbName);

    try {
      await this.migrationRunner.run(dbName);
      await this.seeder.seed(dbName);
    } catch (error) {
      await this.postgresAdmin.dropDatabase(dbName);
      throw error;
    }
  }
}
