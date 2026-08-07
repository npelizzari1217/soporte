/**
 * TenantMigrationRunnerAdapter — implementación de `ITenantMigrationRunner`:
 * aplica las migraciones del schema tenant sobre una DB física recién
 * creada, invocando `prisma migrate deploy` como subproceso (mismo comando
 * que el script `migrate:tenant` de `package.json`).
 *
 * `execFn` es inyectable (por defecto, `child_process.exec` promisificado)
 * para poder mockearlo en unit tests sin spawnear un proceso real — mismo
 * criterio de testabilidad que `bootstrapRoot` recibe `hashProvider` por
 * parámetro (PR1).
 *
 * Contrato (R18): el comando corre en un subproceso que Prisma cierra al
 * terminar `migrate deploy` — cuando `execFn` resuelve, el subproceso ya
 * salió y sus conexiones a la DB tenant están cerradas (sin cleanup manual
 * adicional acá, a diferencia de `TenantSeederAdapter`, que abre su propio
 * Pool de larga vida dentro del MISMO proceso Node).
 *
 * `DATABASE_URL_TENANT` es la env que lee `prisma.tenant.config.ts` — se
 * deriva de `masterUrl` reemplazando el nombre de la DB (mismo patrón que
 * `PrismaService.buildTenantUrl`), ya que la instancia/credenciales de
 * Postgres son las mismas para master y todos los tenants.
 *
 * Ref spec: sdd/auth-multitenancy/spec §R18
 * Ref design: sdd/auth-multitenancy/design ADR-6
 * Tarea: T7.3 (PR7 — Provisioning: ports + adapters)
 */
import { Injectable } from '@nestjs/common';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { ITenantMigrationRunner } from '../domain/ports/i-tenant-migration-runner.port';

/** Firma inyectable de ejecución de comandos — por defecto, `child_process.exec` promisificado. */
export type ExecFn = (
  command: string,
  options: { cwd: string; env: NodeJS.ProcessEnv },
) => Promise<{ stdout: string; stderr: string }>;

const DEFAULT_EXEC_FN: ExecFn = promisify(exec);

@Injectable()
export class TenantMigrationRunnerAdapter implements ITenantMigrationRunner {
  constructor(
    private readonly masterUrl: string,
    private readonly execFn: ExecFn = DEFAULT_EXEC_FN,
    private readonly cwd: string = process.cwd(),
  ) {}

  async run(dbName: string): Promise<void> {
    const command =
      'npx prisma migrate deploy --schema=prisma_tenant/schema.prisma --config prisma.tenant.config.ts';
    await this.execFn(command, {
      cwd: this.cwd,
      env: { ...process.env, DATABASE_URL_TENANT: this.buildTenantUrl(dbName) },
    });
  }

  /** Deriva la URL de conexión del tenant reemplazando el nombre de DB en `masterUrl`. */
  private buildTenantUrl(dbName: string): string {
    const url = new URL(this.masterUrl);
    url.pathname = `/${dbName}`;
    return url.toString();
  }
}
