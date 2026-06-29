/**
 * Script de migración fan-out para todos los tenants activos.
 *
 * Uso:
 *   DATABASE_URL_MASTER=postgresql://u:p@host:5432/soporte_master \
 *     ts-node scripts/migrate-tenants.ts
 *
 * Qué hace:
 *   1. Conecta a master.clientes y obtiene todos los tenants con activo=TRUE
 *      y deleted_at IS NULL (soft-deleted excluidos).
 *   2. Para cada tenant aplica `prisma migrate deploy --schema prisma_tenant/...`
 *      con DATABASE_URL_TENANT apuntando a esa DB.
 *   3. Registra éxito o error por tenant, sin abortar el fan-out ante un fallo.
 *   4. Retorna exit code 0 si todos ok, 1 si alguno falló.
 *
 * Idempotencia:
 *   `prisma migrate deploy` no re-aplica migraciones ya aplicadas;
 *   el script es seguro de ejecutar múltiples veces sobre el mismo conjunto.
 *
 * Contrato de conexiones:
 *   El pool a master se cierra automáticamente antes de retornar (MigrateTenantsRunner).
 *
 * Ref spec: [SPEC:design/Fan-out de migraciones, riesgo de drift de esquema]
 * Tarea: 7.B.2
 */
import { MigrateTenantsRunner } from './migrate-tenants.runner';

const MASTER_URL =
  process.env.DATABASE_URL_MASTER ?? 'postgresql://soporte:soporte@localhost:5432/soporte_master';

async function main(): Promise<void> {
  console.log('migrate-tenants: starting fan-out...');
  console.log(`Master DB: ${MASTER_URL}`);

  const runner = new MigrateTenantsRunner({ masterUrl: MASTER_URL });
  const results = await runner.run();

  let hasErrors = false;
  for (const result of results) {
    if (result.status === 'success') {
      console.log(`[OK]    ${result.dbName}`);
    } else {
      console.error(`[ERROR] ${result.dbName}: ${result.error ?? 'unknown error'}`);
      hasErrors = true;
    }
  }

  const succeeded = results.filter((r) => r.status === 'success').length;
  const failed = results.filter((r) => r.status === 'error').length;
  console.log(
    `\nmigrate-tenants: ${succeeded} succeeded, ${failed} failed (total: ${results.length}).`,
  );

  if (hasErrors) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('migrate-tenants: fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
