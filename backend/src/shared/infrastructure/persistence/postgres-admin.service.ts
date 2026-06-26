import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, QueryResult } from 'pg';

/**
 * PostgresAdminService — operaciones de administración de bases de datos.
 *
 * Conecta a la DB `postgres` (admin DB del servidor) usando pg.Pool directo,
 * NO a través de Prisma ni del client tenant. Esto es necesario porque
 * CREATE DATABASE y DROP DATABASE no pueden ejecutarse dentro de una
 * transacción Prisma, y deben hacerse contra la DB admin del servidor.
 *
 * Responsabilidad única (SRP): crear, eliminar y verificar existencia de DBs.
 * No tiene lógica de dominio ni de aplicación.
 *
 * Uso en provisioning:
 *  - createDatabase: primer paso del provisioning de tenant nuevo
 *  - dropDatabase: compensación en rollback si el provisioning falla
 *  - databaseExists: verificación idempotente antes de crear
 *
 * Ref spec: [SPEC:clientes/Provisioning de tenant nuevo]
 *           [SPEC:clientes/Provisioning fallido dispara rollback compensatorio]
 * Tarea: 7.A.2
 */
@Injectable()
export class PostgresAdminService implements OnModuleDestroy {
  private readonly pool: Pool;

  /**
   * @param masterUrl URL de conexión a la DB master (ej. postgresql://u:p@host:5432/soporte_master).
   *                  El servicio deriva automáticamente la URL admin reemplazando el nombre de DB
   *                  por 'postgres'.
   */
  constructor(masterUrl: string) {
    // Guard: si masterUrl está vacío (ej. env var no definida en test bootstrap),
    // pg.Pool acepta connectionString vacío en construcción y solo fallará
    // al hacer la primera query — igual que PrismaService.
    const adminUrl = masterUrl ? this.buildAdminUrl(masterUrl) : '';
    this.pool = new Pool({ connectionString: adminUrl });
  }

  /**
   * Crea una base de datos Postgres con el nombre indicado.
   * El identificador se quoted para prevenir SQL injection.
   *
   * IMPORTANTE: CREATE DATABASE no puede ejecutarse dentro de una transacción.
   * El pool admin (no Prisma) se usa precisamente para evitar esa restricción.
   *
   * @throws Error si la DB ya existe o si hay un error de conexión.
   */
  async createDatabase(dbName: string): Promise<void> {
    const identifier = this.quoteIdentifier(dbName);
    await this.pool.query(`CREATE DATABASE ${identifier}`);
  }

  /**
   * Dropea una base de datos si existe. La cláusula IF EXISTS hace que esta
   * operación sea segura como paso de compensación en rollback: si la DB nunca
   * se llegó a crear, el drop no falla.
   *
   * WITH (FORCE) (PG 16+) termina las conexiones activas a la DB antes de
   * dropearla. Esto hace el rollback/teardown robusto: si un pool tenant no
   * alcanzó a cerrarse, el drop no falla ni deja la DB huérfana.
   *
   * @throws Error ante fallos de conexión al servidor admin u otros errores de pg.
   */
  async dropDatabase(dbName: string): Promise<void> {
    const identifier = this.quoteIdentifier(dbName);
    await this.pool.query(`DROP DATABASE IF EXISTS ${identifier} WITH (FORCE)`);
  }

  /**
   * Verifica si una base de datos existe en el servidor Postgres.
   * Usa una query parametrizada contra pg_database (no interpolación de identificadores).
   *
   * @returns true si la DB existe, false si no.
   */
  async databaseExists(dbName: string): Promise<boolean> {
    const result: QueryResult<Record<string, unknown>> = await this.pool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName],
    );
    return result.rows.length > 0;
  }

  /**
   * Cierra todas las conexiones del pool al destruir el módulo NestJS.
   * Previene connection leaks en shutdown gracioso.
   */
  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Deriva la URL de la DB admin reemplazando el nombre de DB en la URL master
   * por 'postgres' (la DB administrativa del servidor Postgres).
   *
   * Ejemplo: postgresql://u:p@host:5432/soporte_master → postgresql://u:p@host:5432/postgres
   */
  private buildAdminUrl(masterUrl: string): string {
    const url = new URL(masterUrl);
    url.pathname = '/postgres';
    return url.toString();
  }

  /**
   * Quotea un identificador Postgres (nombre de DB, tabla, etc.) para prevenir
   * SQL injection. Sigue el estándar SQL: envuelve en comillas dobles y escapa
   * comillas dobles internas duplicándolas.
   *
   * Ejemplo: my_db → "my_db"  |  db"name → "db""name"
   */
  private quoteIdentifier(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }
}
