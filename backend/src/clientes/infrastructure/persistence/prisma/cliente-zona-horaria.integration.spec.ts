/**
 * cliente-zona-horaria.integration.spec.ts — invariante de la migración
 * `20260901120000_add_cliente_zona_horaria` contra `soporte_master_test`
 * (sdd/zona-horaria-por-tenant, WU-2 tarea 2.3).
 *
 * Verifica el invariante a nivel de BASE (no de dominio, eso ya lo cubre
 * `zona-horaria.spec.ts` y `cliente.mapper.spec.ts`): ninguna fila de
 * `clientes` puede quedar con `zona_horaria` NULL ni inválida después de la
 * migración —
 *
 * - una fila insertada SIN la columna (simula una fila de antes de migrar)
 *   recibe el backfill por DEFAULT, nunca NULL, y ese default es una zona
 *   válida (D8);
 * - la columna RECHAZA un NULL explícito — `NOT NULL` es de la base, no solo
 *   una convención de la capa de aplicación;
 * - un barrido de la tabla completa nunca encuentra una fila con zona NULL
 *   ni inválida, sin importar cómo se insertó la fila.
 *
 * `soporte_master_test` es una base compartida por todos los specs de
 * integración (`TRUNCATE` en cada uno) — `usarLockMasterTest()` toma el
 * turno exclusivo antes del `describe`.
 */
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { esZonaValida } from '../../../../shared/domain/zona-horaria';
import { usarLockMasterTest } from '../../../../testing/lock-master-test';

const TEST_DB_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

usarLockMasterTest();

describe('Migración add_cliente_zona_horaria — invariante NOT NULL con backfill (integración)', () => {
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;

  beforeAll(() => {
    prismaService = new PrismaService(TEST_DB_URL);
    masterClient = prismaService.getMasterClient();
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE usuario_cliente_permisos, membresias, refresh_tokens, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );
  });

  it('fila insertada sin zona_horaria recibe el backfill por defecto, nunca NULL', async () => {
    await masterClient.$executeRawUnsafe(
      `INSERT INTO clientes (nombre, db_name, updated_at) VALUES ('Cliente Sin Zona', 'db_sin_zona_test', now())`,
    );

    const rows = await masterClient.$queryRawUnsafe<{ zona_horaria: string | null }[]>(
      `SELECT zona_horaria FROM clientes WHERE db_name = 'db_sin_zona_test'`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.zona_horaria).not.toBeNull();
    expect(esZonaValida(rows[0]!.zona_horaria!)).toBe(true);
  });

  it('[CRITICAL] la columna rechaza un NULL explícito — NOT NULL de base, no solo de aplicación', async () => {
    await expect(
      masterClient.$executeRawUnsafe(
        `INSERT INTO clientes (nombre, db_name, updated_at, zona_horaria) VALUES ('Cliente Zona Null', 'db_zona_null_test', now(), NULL)`,
      ),
    ).rejects.toThrow();
  });

  it('ningún registro de la tabla tiene zona_horaria NULL ni inválida, sin importar cómo se insertó', async () => {
    await masterClient.$executeRawUnsafe(
      `INSERT INTO clientes (nombre, db_name, updated_at) VALUES ('Cliente Backfill', 'db_backfill_test', now())`,
    );
    await masterClient.$executeRawUnsafe(
      `INSERT INTO clientes (nombre, db_name, updated_at, zona_horaria) VALUES ('Cliente Madrid', 'db_madrid_test', now(), 'Europe/Madrid')`,
    );

    const rows = await masterClient.$queryRawUnsafe<{ zona_horaria: string | null }[]>(
      'SELECT zona_horaria FROM clientes',
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.zona_horaria).not.toBeNull();
      expect(esZonaValida(row.zona_horaria!)).toBe(true);
    }
  });
});
