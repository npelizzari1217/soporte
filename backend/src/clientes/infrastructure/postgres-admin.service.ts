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
 */
import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { IPostgresAdminPort } from '../domain/ports/i-postgres-admin.port';
import { InvalidDatabaseNameError } from '../domain/errors/clientes.errors';

/** Identificador Postgres seguro: letras/dígitos/guion bajo, sin empezar con dígito. */
const VALID_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

@Injectable()
export class PostgresAdminService implements IPostgresAdminPort {
  constructor(private readonly masterUrl: string) {}

  async createDatabase(dbName: string): Promise<void> {
    assertValidIdentifier(dbName);
    const pool = this.openAdminPool();
    try {
      await pool.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);
    } finally {
      await pool.end();
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

  /** Abre un Pool contra la DB de mantenimiento `postgres` (misma instancia/credenciales que `masterUrl`). */
  private openAdminPool(): InstanceType<typeof Pool> {
    const adminUrl = new URL(this.masterUrl);
    adminUrl.pathname = '/postgres';
    return new Pool({ connectionString: adminUrl.toString() });
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
