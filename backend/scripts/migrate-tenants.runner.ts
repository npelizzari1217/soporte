/**
 * MigrateTenantsRunner — runner de migraciones fan-out para todos los tenants activos.
 *
 * Responsabilidad única (SRP):
 *   1. Consultar master.clientes (activo=TRUE, deleted_at IS NULL).
 *   2. Aplicar `prisma migrate deploy` a cada tenant con su DATABASE_URL_TENANT.
 *   3. Registrar resultado por tenant (success/error).
 *   4. No abortar el fan-out por un tenant fallido (reporte agregado).
 *
 * Contrato de conexiones (CRÍTICO):
 *   El pool a la DB master se cierra en `finally` ANTES de retornar,
 *   sea éxito o error. Esto es esencial para que operaciones posteriores
 *   (como DROP DATABASE en rollback compensatorio) no fallen con
 *   "database is being accessed by other users".
 *
 * Idempotencia:
 *   `prisma migrate deploy` no re-aplica migraciones ya aplicadas;
 *   el runner es seguro de ejecutar múltiples veces.
 *
 * Ref spec: [SPEC:design/Fan-out de migraciones, riesgo de drift de esquema]
 * Tarea: 7.B.2
 */
import { Pool } from 'pg';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface TenantMigrationResult {
  dbName: string;
  status: 'success' | 'error';
  error?: string;
}

/**
 * Función injectable para ejecutar comandos de shell.
 * Recibe el comando y los env overrides; resuelve en éxito, lanza en error.
 * La implementación por defecto usa child_process.exec.
 */
export type ExecFn = (command: string, env: Record<string, string>) => Promise<void>;

export interface MigrateTenantsRunnerOptions {
  /** URL de conexión a la DB master (ej. postgresql://u:p@host:5432/soporte_master). */
  masterUrl: string;
  /** Ruta al schema tenant relativa al CWD (default: 'prisma_tenant/schema.prisma'). */
  tenantSchemaPath?: string;
  /** Ruta al config de Prisma CLI para el tenant (default: 'prisma.tenant.config.ts'). */
  configPath?: string;
  /**
   * Función de ejecución de comandos, injectable para tests.
   * En producción usa child_process.exec con el env del proceso + overrides.
   */
  execFn?: ExecFn;
}

export class MigrateTenantsRunner {
  private readonly pool: Pool;
  private readonly masterUrl: string;
  private readonly tenantSchemaPath: string;
  private readonly configPath: string;
  private readonly execFn: ExecFn;

  constructor(opts: MigrateTenantsRunnerOptions) {
    this.masterUrl = opts.masterUrl;
    this.tenantSchemaPath = opts.tenantSchemaPath ?? 'prisma_tenant/schema.prisma';
    this.configPath = opts.configPath ?? 'prisma.tenant.config.ts';
    this.execFn = opts.execFn ?? defaultExec;
    this.pool = new Pool({ connectionString: opts.masterUrl });
  }

  /**
   * Aplica migraciones a todos los tenants activos en fan-out.
   *
   * Garantías:
   *  - Solo migra clientes con activo=TRUE y deleted_at IS NULL (soft-deleted excluidos).
   *  - Un fallo en el tenant N no aborta N+1..M (non-aborting fan-out).
   *  - El pool se cierra en finally ANTES de retornar (CONTRATO CRÍTICO).
   *
   * @returns Array de resultados por tenant, con status 'success' o 'error'.
   * @throws Error si la consulta a master.clientes falla (el pool igualmente se cierra).
   */
  async run(): Promise<TenantMigrationResult[]> {
    const results: TenantMigrationResult[] = [];

    try {
      const { rows } = await this.pool.query<{ db_name: string }>(
        `SELECT db_name FROM clientes WHERE activo = TRUE AND deleted_at IS NULL`,
      );

      for (const row of rows) {
        const dbName = row.db_name;
        try {
          const tenantUrl = this.buildTenantUrl(dbName);
          await this.execFn(
            `./node_modules/.bin/prisma migrate deploy` +
              ` --schema=${this.tenantSchemaPath}` +
              ` --config ${this.configPath}`,
            { DATABASE_URL_TENANT: tenantUrl },
          );
          results.push({ dbName, status: 'success' });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          results.push({ dbName, status: 'error', error: message });
        }
      }
    } finally {
      // CONTRATO CRÍTICO: cerrar pool ANTES de retornar, sea éxito o error.
      // Postgres rechaza DROP DATABASE si quedan conexiones activas.
      await this.pool.end();
    }

    return results;
  }

  /**
   * Construye la URL del tenant reemplazando el nombre de DB en la URL master.
   * Mismo patrón que PrismaService.buildTenantUrl() en shared/infrastructure.
   *
   * Ejemplo: .../soporte_master → .../tenant_acme
   */
  private buildTenantUrl(dbName: string): string {
    const url = new URL(this.masterUrl);
    url.pathname = `/${dbName}`;
    return url.toString();
  }
}

/**
 * Implementación por defecto de ExecFn.
 * Ejecuta el comando con el env del proceso actual + los overrides indicados.
 */
async function defaultExec(command: string, env: Record<string, string>): Promise<void> {
  await execAsync(command, { env: { ...process.env, ...env } });
}
