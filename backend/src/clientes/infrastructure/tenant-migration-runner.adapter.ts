/**
 * TenantMigrationRunnerAdapter — implementación de ITenantMigrationRunner.
 *
 * Aplica las migraciones Prisma del schema tenant sobre UNA DB específica,
 * ejecutando `prisma migrate deploy` como subprocess con DATABASE_URL_TENANT
 * apuntando a esa DB.
 *
 * Patrón ExecFn inyectable (mismo que MigrateTenantsRunner en scripts/):
 *   - En producción: usa child_process.exec a través de execAsync.
 *   - En tests: se inyecta un mock para no invocar procesos reales.
 *
 * Contrato de conexiones:
 *   `prisma migrate deploy` ejecuta como subprocess que cierra sus propias
 *   conexiones al terminar. Este adapter NO crea conexiones Postgres propias.
 *   El contrato ITenantMigrationRunner se cumple: no quedan conexiones activas
 *   después de que `runMigrations` resuelve (sea éxito o error).
 *
 * Nota: el CWD del proceso parent (jest o app NestJS) debe ser backend/
 * para que `./node_modules/.bin/prisma`, `prisma_tenant/schema.prisma` y
 * `prisma.tenant.config.ts` se resuelvan correctamente.
 *
 * Ref spec: [SPEC:clientes/Provisioning de tenant nuevo — migraciones tenant]
 * Tarea: Batch 4 - Parte A
 */
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Función de ejecución de comandos shell, injectable para tests.
 * Recibe el comando y los overrides de env.
 * Resuelve en éxito, lanza en error.
 */
export type ExecFn = (command: string, env: Record<string, string>) => Promise<void>;

/** Implementación por defecto: child_process.exec con env del proceso + overrides. */
async function defaultExec(command: string, env: Record<string, string>): Promise<void> {
  await execAsync(command, { env: { ...process.env, ...env } });
}

export class TenantMigrationRunnerAdapter {
  private readonly execFn: ExecFn;

  constructor(
    private readonly masterUrl: string,
    execFn?: ExecFn,
  ) {
    this.execFn = execFn ?? defaultExec;
  }

  /**
   * Aplica todas las migraciones pendientes del schema tenant sobre la DB indicada.
   *
   * Comando ejecutado:
   *   ./node_modules/.bin/prisma migrate deploy \
   *     --schema=prisma_tenant/schema.prisma \
   *     --config prisma.tenant.config.ts
   *
   * Con DATABASE_URL_TENANT apuntando a la DB del tenant específico.
   */
  async runMigrations(dbName: string): Promise<void> {
    const tenantUrl = this.buildTenantUrl(dbName);
    await this.execFn(
      `./node_modules/.bin/prisma migrate deploy` +
        ` --schema=prisma_tenant/schema.prisma` +
        ` --config prisma.tenant.config.ts`,
      { DATABASE_URL_TENANT: tenantUrl },
    );
  }

  /**
   * Construye la URL del tenant reemplazando el nombre de DB en la URL master.
   * Mismo patrón que MigrateTenantsRunner.buildTenantUrl() y PrismaService.buildTenantUrl().
   */
  private buildTenantUrl(dbName: string): string {
    const url = new URL(this.masterUrl);
    url.pathname = `/${dbName}`;
    return url.toString();
  }
}
