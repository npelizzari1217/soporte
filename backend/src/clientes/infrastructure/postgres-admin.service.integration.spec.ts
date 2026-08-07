/**
 * T7.2 [INT][GATED→destrabada por decisión #2025] — Tests de integración de
 * `PostgresAdminService` contra Postgres REAL: crea y borra bases de datos
 * físicas efímeras.
 *
 * SEGURIDAD: este spec SOLO crea/borra bases cuyo nombre termina en `_test`
 * y lleva el prefijo `soporte_prov_` + sufijo aleatorio, generadas en
 * `beforeEach`/`it` y borradas en `afterEach`/`afterAll` — nunca toca
 * `soporte_master`, `soporte_master_test`, `soporte_tenant_test`,
 * `soporte_e2e`, ni las bases `soporte_019f...` de soporte1.
 *
 * Contrato verificado (spec R17):
 * - `createDatabase` crea una DB real, consultable en `pg_database`.
 * - `dropDatabase` la borra; correrlo sobre una DB inexistente NO falla
 *   (IF EXISTS).
 * - `databaseExists` refleja el estado real antes/después de crear/borrar.
 *
 * Ref spec: sdd/auth-multitenancy/spec §R17
 * Tarea: T7.2
 */
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PostgresAdminService } from './postgres-admin.service';

const MASTER_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

/** Genera un nombre de DB efímero único, SIEMPRE con sufijo `_test`. */
function ephemeralDbName(): string {
  return `soporte_prov_${randomBytes(4).toString('hex')}_test`;
}

async function realDatabaseExists(dbName: string): Promise<boolean> {
  const adminUrl = new URL(MASTER_URL);
  adminUrl.pathname = '/postgres';
  const pool = new Pool({ connectionString: adminUrl.toString() });
  try {
    const result = await pool.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    return (result.rowCount ?? 0) > 0;
  } finally {
    await pool.end();
  }
}

describe('PostgresAdminService (T7.2, integración — Postgres real)', () => {
  let service: PostgresAdminService;
  const createdDbNames: string[] = [];

  beforeAll(() => {
    service = new PostgresAdminService(MASTER_URL);
  });

  afterEach(async () => {
    // Limpieza defensiva: si un test deja una DB creada, la borramos igual
    // aunque el propio test ya la haya borrado (dropDatabase es IF EXISTS).
    while (createdDbNames.length > 0) {
      const dbName = createdDbNames.pop()!;
      await service.dropDatabase(dbName);
    }
  });

  it('[CRITICAL] createDatabase crea una DB física real, verificable en pg_database', async () => {
    const dbName = ephemeralDbName();
    createdDbNames.push(dbName);

    await service.createDatabase(dbName);

    await expect(realDatabaseExists(dbName)).resolves.toBe(true);
  });

  it('databaseExists refleja true tras crear y false tras borrar', async () => {
    const dbName = ephemeralDbName();
    createdDbNames.push(dbName);

    await expect(service.databaseExists(dbName)).resolves.toBe(false);

    await service.createDatabase(dbName);
    await expect(service.databaseExists(dbName)).resolves.toBe(true);

    await service.dropDatabase(dbName);
    createdDbNames.pop();
    await expect(service.databaseExists(dbName)).resolves.toBe(false);
  });

  it('[CRITICAL] dropDatabase borra la DB física real', async () => {
    const dbName = ephemeralDbName();
    await service.createDatabase(dbName);

    await service.dropDatabase(dbName);

    await expect(realDatabaseExists(dbName)).resolves.toBe(false);
  });

  it('dropDatabase sobre una DB inexistente NO falla (IF EXISTS)', async () => {
    const dbName = ephemeralDbName(); // nunca creada

    await expect(service.dropDatabase(dbName)).resolves.toBeUndefined();
  });

  it('createDatabase sobre un nombre ya existente falla (sin IF NOT EXISTS — la app decide antes de llamar)', async () => {
    const dbName = ephemeralDbName();
    createdDbNames.push(dbName);
    await service.createDatabase(dbName);

    await expect(service.createDatabase(dbName)).rejects.toThrow();
  });
});
