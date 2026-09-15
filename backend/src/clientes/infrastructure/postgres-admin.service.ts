/**
 * PostgresAdminService — implementación de `IPostgresAdminPort`: crea/borra/
 * verifica bases de datos físicas Postgres, conectándose a la DB de
 * mantenimiento `postgres` (nunca a la DB master ni a la DB tenant, que no
 * pueden ejecutar `CREATE DATABASE`/`DROP DATABASE` sobre sí mismas).
 *
 * Postgres NO soporta parámetros bindeados ($1) para identificadores de DDL
 * (nombres de DB) — la defensa real anti SQL-injection es la whitelist de
 * `assertValidIdentifier` (solo `[a-zA-Z_][a-zA-Z0-9_]*`); el quoting con
 * comillas dobles (R17) es defensa en profundidad adicional.
 *
 * Cada operación abre un `pg.Pool` propio contra `postgres` y lo cierra en
 * `finally` — sin pools de larga vida acá (a diferencia de `PrismaService`):
 * estas operaciones son infrecuentes (alta de tenant) y NO deben competir
 * por conexiones con el tráfico normal de la app.
 *
 * Ref spec: sdd/auth-multitenancy/spec §R17
 * Ref design: sdd/auth-multitenancy/design ADR-6
 * Tareas: T7.1, T7.2 (PR7 — Provisioning: ports + adapters)
 *
 * WU2 (sdd/sesion-utc-y-backfill-de-fechas, ADR-1, R5): `createDatabase`
 * emite `ALTER DATABASE ... SET timezone TO 'UTC'` inmediatamente después de
 * `CREATE DATABASE`, sobre el MISMO pool admin, para que un tenant nuevo
 * nazca en UTC antes de que corran `migrate`/`seed` — segunda garantía
 * independiente de la que ya cubre `conUtc()` (por conexión). El pool admin
 * también pasa a abrirse vía `conUtc()`. `ALTER DATABASE` requiere ser
 * dueño de la base: si el rol de `masterUrl` no lo es, Postgres devuelve
 * `insufficient_privilege` (SQLSTATE 42501) — se captura y se degrada a
 * WARNING (no se propaga): cortar el alta de un tenant por esto sería peor
 * que quedarse solo con la garantía por conexión, que ya cubre el 100% del
 * tráfico de la app. Cualquier otro error del ALTER DATABASE sí propaga.
 * El runbook agrega la verificación post-deploy (`SHOW timezone`).
 */
import { Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { conUtc } from '../../shared/infrastructure/persistence/utc-connection-string';
import { IPostgresAdminPort } from '../domain/ports/i-postgres-admin.port';
import { InvalidDatabaseNameError } from '../domain/errors/clientes.errors';

/** Identificador Postgres seguro: letras/dígitos/guion bajo, sin empezar con dígito. */
const VALID_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** SQLSTATE de Postgres para "el rol no tiene el privilegio requerido". */
const SQLSTATE_INSUFFICIENT_PRIVILEGE = '42501';

@Injectable()
export class PostgresAdminService implements IPostgresAdminPort {
  constructor(private readonly masterUrl: string) {}

  async createDatabase(dbName: string): Promise<void> {
    assertValidIdentifier(dbName);
    const pool = this.openAdminPool();
    try {
      await pool.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);
      await this.setDatabaseTimezoneUtc(pool, dbName);
    } finally {
      await pool.end();
    }
  }

  /**
   * ALTER DATABASE ... SET timezone TO 'UTC' (ADR-1, R5). Degrada a WARNING
   * en `insufficient_privilege` en vez de fallar el alta del tenant — ver el
   * comment de cabecera del archivo.
   */
  private async setDatabaseTimezoneUtc(pool: Pool, dbName: string): Promise<void> {
    try {
      await pool.query(`ALTER DATABASE ${quoteIdentifier(dbName)} SET timezone TO 'UTC'`);
    } catch (error) {
      if (isInsufficientPrivilege(error)) {
        console.warn(
          `[postgres-admin] ALTER DATABASE ${quoteIdentifier(dbName)} SET timezone TO 'UTC' ` +
            'falló por insufficient_privilege (42501): el rol no es dueño de la base. ' +
            'La sesión sigue garantizada por conexión (conUtc); verificar `SHOW timezone` ' +
            'post-deploy.',
          error,
        );
        return;
      }
      throw error;
    }
  }

  async dropDatabase(dbName: string): Promise<void> {
    assertValidIdentifier(dbName);
    const pool = this.openAdminPool();
    try {
      // IF EXISTS: dropDatabase también se usa como compensación de rollback
      // (R18) — no debe fallar si la DB nunca llegó a crearse.
      await pool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)}`);
    } finally {
      await pool.end();
    }
  }

  async databaseExists(dbName: string): Promise<boolean> {
    assertValidIdentifier(dbName);
    const pool = this.openAdminPool();
    try {
      const result = await pool.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
      return (result.rowCount ?? 0) > 0;
    } finally {
      await pool.end();
    }
  }

  /**
   * Abre un Pool contra la DB de mantenimiento `postgres` (misma instancia/
   * credenciales que `masterUrl`), vía `conUtc()` (ADR-1, sdd/sesion-utc-y-
   * backfill-de-fechas) — único punto autorizado a construir `pg.Pool`.
   */
  private openAdminPool(): Pool {
    const adminUrl = new URL(this.masterUrl);
    adminUrl.pathname = '/postgres';
    return conUtc(adminUrl.toString());
  }
}

/** Valida que `dbName` sea un identificador seguro ANTES de tocar el Pool. */
function assertValidIdentifier(dbName: string): void {
  if (!VALID_IDENTIFIER.test(dbName)) {
    throw new InvalidDatabaseNameError(dbName);
  }
}

/** Quotea un identificador ya validado (duplica comillas dobles internas por si las hubiera). */
function quoteIdentifier(dbName: string): string {
  return `"${dbName.replace(/"/g, '""')}"`;
}

/** ¿El error es `insufficient_privilege` (SQLSTATE 42501) — el rol no es dueño de la base? */
function isInsufficientPrivilege(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === SQLSTATE_INSUFFICIENT_PRIVILEGE
  );
}
