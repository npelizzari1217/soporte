/**
 * T7.1 [UNIT] — Tests de contrato de `PostgresAdminService` con un stub de
 * `pg.Pool` (sin Postgres real — eso es T7.2, integración).
 *
 * Contrato verificado (spec R17):
 * - `createDatabase`/`dropDatabase`/`databaseExists` construyen el SQL con
 *   el identificador QUOTED (anti SQL-injection) contra la DB de
 *   mantenimiento `postgres` (nunca contra `masterUrl` directamente).
 * - Nombre de DB inválido (no alfanumérico/guion bajo) → MUST rechazar
 *   ANTES de tocar el Pool — `InvalidDatabaseNameError`, sin abrir conexión.
 * - `dropDatabase` usa `IF EXISTS` (no falla si la DB no existe).
 * - Cada operación abre su propio Pool y lo cierra (`pool.end()`) al
 *   terminar, incluso si la query falla.
 *
 * Ref spec: sdd/auth-multitenancy/spec §R17
 * Ref design: sdd/auth-multitenancy/design ADR-6
 * Tarea: T7.1
 */
import { Pool } from 'pg';
import { PostgresAdminService } from './postgres-admin.service';
import { InvalidDatabaseNameError } from '../domain/errors/clientes.errors';

vi.mock('pg', () => {
  const query = vi.fn();
  const end = vi.fn();
  // `function` (no arrow) — vitest exige un constructor real para que `new Pool(...)` funcione.
  const PoolMock = vi.fn().mockImplementation(function PoolStub() {
    return { query, end };
  });
  return { Pool: PoolMock };
});

const MASTER_URL = 'postgresql://soporte:soporte@localhost:5432/soporte_master';

function lastPoolInstance(): { query: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } {
  const PoolMock = Pool as unknown as ReturnType<typeof vi.fn>;
  const calls = PoolMock.mock.results;
  return calls[calls.length - 1]!.value;
}

describe('PostgresAdminService (T7.1, unit — stub de pg.Pool)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createDatabase: abre el Pool contra la DB "postgres" (no contra masterUrl)', async () => {
    const service = new PostgresAdminService(MASTER_URL);
    lastPoolInstanceSetOk();

    await service.createDatabase('soporte_prov_demo_test');

    const PoolMock = Pool as unknown as ReturnType<typeof vi.fn>;
    const usedUrl = PoolMock.mock.calls[0]![0].connectionString as string;
    expect(new URL(usedUrl).pathname).toBe('/postgres');
  });

  it('[CRITICAL] createDatabase: emite CREATE DATABASE con el identificador QUOTED', async () => {
    const service = new PostgresAdminService(MASTER_URL);
    lastPoolInstanceSetOk();

    await service.createDatabase('soporte_prov_demo_test');

    const { query } = lastPoolInstance();
    expect(query).toHaveBeenCalledWith('CREATE DATABASE "soporte_prov_demo_test"');
  });

  it('[CRITICAL] dropDatabase: emite DROP DATABASE IF EXISTS con el identificador QUOTED', async () => {
    const service = new PostgresAdminService(MASTER_URL);
    lastPoolInstanceSetOk();

    await service.dropDatabase('soporte_prov_demo_test');

    const { query } = lastPoolInstance();
    expect(query).toHaveBeenCalledWith('DROP DATABASE IF EXISTS "soporte_prov_demo_test"');
  });

  it('databaseExists: consulta pg_database con el nombre bindeado ($1, sin interpolar)', async () => {
    const service = new PostgresAdminService(MASTER_URL);
    lastPoolInstanceSetOk({ rowCount: 1 });

    const exists = await service.databaseExists('soporte_prov_demo_test');

    const { query } = lastPoolInstance();
    expect(query).toHaveBeenCalledWith('SELECT 1 FROM pg_database WHERE datname = $1', [
      'soporte_prov_demo_test',
    ]);
    expect(exists).toBe(true);
  });

  it('databaseExists: rowCount 0 → false', async () => {
    const service = new PostgresAdminService(MASTER_URL);
    lastPoolInstanceSetOk({ rowCount: 0 });

    await expect(service.databaseExists('nope_test')).resolves.toBe(false);
  });

  it.each([
    'soporte-con-guion',
    'soporte con espacio',
    'soporte"; DROP TABLE x; --',
    '1soporte',
    '',
  ])(
    '[CRITICAL] nombre inválido "%s" → InvalidDatabaseNameError, SIN abrir Pool',
    async (badName) => {
      const service = new PostgresAdminService(MASTER_URL);

      await expect(service.createDatabase(badName)).rejects.toBeInstanceOf(
        InvalidDatabaseNameError,
      );
      const PoolMock = Pool as unknown as ReturnType<typeof vi.fn>;
      expect(PoolMock).not.toHaveBeenCalled();
    },
  );

  it('[FIX] createDatabase: cierra el Pool aunque la query falle', async () => {
    const service = new PostgresAdminService(MASTER_URL);
    const PoolMock = Pool as unknown as ReturnType<typeof vi.fn>;
    const query = vi.fn().mockRejectedValue(new Error('DB ya existe'));
    const end = vi.fn();
    PoolMock.mockImplementationOnce(function PoolStub() {
      return { query, end };
    });

    await expect(service.createDatabase('soporte_prov_demo_test')).rejects.toThrow('DB ya existe');
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('createDatabase: cierra el Pool tras una operación exitosa', async () => {
    const service = new PostgresAdminService(MASTER_URL);
    lastPoolInstanceSetOk();

    await service.createDatabase('soporte_prov_demo_test');

    const { end } = lastPoolInstance();
    expect(end).toHaveBeenCalledTimes(1);
  });
});

/** Configura el stub de `pg.Pool` para que la próxima instancia resuelva `query` en éxito. */
function lastPoolInstanceSetOk(queryResult: { rowCount: number } = { rowCount: 0 }): void {
  const PoolMock = Pool as unknown as ReturnType<typeof vi.fn>;
  const query = vi.fn().mockResolvedValue(queryResult);
  const end = vi.fn();
  PoolMock.mockImplementationOnce(function PoolStub() {
    return { query, end };
  });
}
