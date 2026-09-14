/**
 * utc-backfill-fechas.integration.spec.ts — WU3 (Phase 3,
 * sdd/sesion-utc-y-backfill-de-fechas), issue #173.
 *
 * Lee el `migration.sql` REAL del disco y lo ejecuta contra Postgres —
 * mismo criterio que `add-cliente-smtp-config.integration.spec.ts` y
 * `scripts/backfill-correo-clientes.integration.spec.ts`: las dos
 * implementaciones (spec y migración) no pueden divergir en silencio.
 * DB EFÍMERA propia, nunca `soporte_master_test` (esa ya tiene esta
 * migración aplicada de forma permanente para el resto de la suite).
 *
 * Ref design: ADR-1, ADR-2, ADR-3, ADR-4, ADR-7. Ref spec:
 * `fechas-sesion-utc` — R3 (corrección del dato histórico), R4
 * (ejecución exactamente-una-vez). Ref tasks: 3.1, 3.2, 3.5.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { PostgresAdminService } from '../src/clientes/infrastructure/postgres-admin.service';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const RUTA_BACKEND = path.resolve(__dirname, '..');
const MASTER_MIGRATIONS_DIR = path.resolve(__dirname, './migrations');
// Última carpeta preexistente que este fixture reproduce ANTES de la
// migración bajo test — la más nueva al momento de escribir WU3.
const ULTIMA_CARPETA_PREVIA = '20260909130000_seed_feriados_nacionales_inamovibles';
const MIGRATION_UNDER_TEST = '20260914150000_sesion_utc_y_backfill_fechas';
const MIGRATION_FILE = path.join(MASTER_MIGRATIONS_DIR, MIGRATION_UNDER_TEST, 'migration.sql');

/* eslint-disable @typescript-eslint/no-require-imports */
const prismaPkgJson = require.resolve('prisma/package.json') as string;
const PRISMA_BIN = path.join(
  path.dirname(prismaPkgJson),
  (require(prismaPkgJson) as { bin: { prisma: string } }).bin.prisma,
);
/* eslint-enable @typescript-eslint/no-require-imports */

function nuevoNombreDbEfimera(sufijo: string): string {
  return `soporte_utc_backfill_${sufijo}_${randomBytes(4).toString('hex')}_test`;
}

function urlHaciaDb(dbName: string): string {
  const url = new URL(MASTER_TEST_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}

/** Corre, en orden, los `migration.sql` con carpeta <= `ULTIMA_CARPETA_PREVIA`. */
async function reproducirSchemaPrevio(pool: InstanceType<typeof Pool>): Promise<void> {
  const carpetas = fs
    .readdirSync(MASTER_MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .filter((nombre) => nombre <= ULTIMA_CARPETA_PREVIA)
    .sort();

  for (const carpeta of carpetas) {
    const sql = fs.readFileSync(path.join(MASTER_MIGRATIONS_DIR, carpeta, 'migration.sql'), 'utf8');
    await pool.query(sql);
  }
}

/** Inserta un cliente fixture con `created_at`/`updated_at` explícitos (control total de microsegundos). */
async function insertarClienteFixture(
  pool: InstanceType<typeof Pool>,
  args: { nombre: string; dbName: string; timestamp: string },
): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO clientes (id, nombre, db_name, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3::timestamptz, $3::timestamptz)
     RETURNING id`,
    [args.nombre, args.dbName, args.timestamp],
  );
  return rows[0].id as string;
}

async function leerFechasCliente(
  pool: InstanceType<typeof Pool>,
  id: string,
): Promise<{ createdAt: Date; updatedAt: Date }> {
  const { rows } = await pool.query(
    'SELECT created_at, updated_at FROM clientes WHERE id = $1',
    [id],
  );
  return { createdAt: rows[0].created_at as Date, updatedAt: rows[0].updated_at as Date };
}

describe('migración 20260914150000 — backfill catalogado por microsegundos (WU3, master)', () => {
  let pool: InstanceType<typeof Pool>;
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const dbName = nuevoNombreDbEfimera('discriminador');
  let idMicrosegundosCero: string;
  let idMicrosegundosDistintoDeCero: string;
  let idClienteConUpdateReal: string;

  beforeAll(async () => {
    await admin.createDatabase(dbName);
    pool = new Pool({ connectionString: urlHaciaDb(dbName) });
    await reproducirSchemaPrevio(pool);

    idMicrosegundosCero = await insertarClienteFixture(pool, {
      nombre: 'Fixture WU3 microsegundos=0 (Prisma)',
      dbName: 'test_wu3_us_cero',
      timestamp: '2026-09-01 10:00:00.000000+00',
    });
    idMicrosegundosDistintoDeCero = await insertarClienteFixture(pool, {
      nombre: 'Fixture WU3 microsegundos!=0 (base)',
      dbName: 'test_wu3_us_distinto',
      timestamp: '2026-09-01 10:00:00.123456+00',
    });

    // Fixture no trivial para R7 (WARNING-4, sdd-verify FAIL round 1):
    // `created_at` y `updated_at` DISTINTOS, ambos con microsegundos=0 (los
    // dos los escribe Prisma — en `soporte_master` TODO `created_at` es
    // `@default(now())` resuelto en cliente, nunca `clock_timestamp()`, así
    // que no existe acá el caso extremo de ADR-3). La traslación uniforme
    // de -3h preserva el delta entre ambas columnas.
    ({
      rows: [{ id: idClienteConUpdateReal }],
    } = await pool.query<{ id: string }>(
      `INSERT INTO clientes (id, nombre, db_name, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3::timestamptz, $4::timestamptz)
       RETURNING id`,
      [
        'Fixture WU3 R7 created!=updated (Prisma, microsegundos=0)',
        'test_wu3_r7_delta',
        '2026-09-01 10:00:00.000000+00',
        '2026-09-02 09:30:00.000000+00',
      ],
    ));
  }, 60_000);

  afterAll(async () => {
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(dbName);
  }, 30_000);

  it('[3.1/3.4] primera corrida (SQL real leído del disco): corrige solo microsegundos=0', async () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    await pool.query(sql);

    const conMicrosegundosCero = await leerFechasCliente(pool, idMicrosegundosCero);
    expect(conMicrosegundosCero.createdAt.toISOString()).toBe('2026-09-01T07:00:00.000Z');
    expect(conMicrosegundosCero.updatedAt.toISOString()).toBe('2026-09-01T07:00:00.000Z');

    const conMicrosegundosDistinto = await leerFechasCliente(pool, idMicrosegundosDistintoDeCero);
    expect(conMicrosegundosDistinto.createdAt.toISOString()).toBe('2026-09-01T10:00:00.123Z');
    expect(conMicrosegundosDistinto.updatedAt.toISOString()).toBe('2026-09-01T10:00:00.123Z');
  });

  it('[R7] invariantes de integridad temporal tras el backfill (soporte_master)', async () => {
    // WARNING-4, sdd-verify FAIL round 1: R7 no tenía evidencia de ningún
    // tipo para `soporte_master` — solo fixtures sintéticas de tenant. Se
    // corre INMEDIATAMENTE después de [3.1/3.4] (una sola corrida correcta
    // de la migración), antes de la caracterización [3.2] que corrompe los
    // datos a propósito.
    //
    // Tolerancia de 1s (spec `fechas-sesion-utc`, ver R7): en master TODAS
    // las fechas las escribe Prisma (@default(now()) resuelto en cliente,
    // nunca clock_timestamp()), así que esta base no tiene el caso extremo
    // de ADR-3 (created_at de la base + updated_at de Prisma) — se audita
    // igual, con la misma tolerancia que el resto del spec, por
    // consistencia y para dejar la propiedad efectivamente comprobada acá,
    // no solo asumida.
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM clientes WHERE updated_at < created_at - INTERVAL '1 second'`,
    );
    expect(Number(rows[0].n)).toBe(0);

    const futuro = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM clientes WHERE created_at > now() OR updated_at > now()`,
    );
    expect(Number(futuro.rows[0].n)).toBe(0);

    // El delta entre created_at y updated_at de una fila con update real se
    // preserva tras la traslación uniforme de -3h.
    const conUpdateReal = await leerFechasCliente(pool, idClienteConUpdateReal);
    expect(conUpdateReal.createdAt.toISOString()).toBe('2026-09-01T07:00:00.000Z');
    expect(conUpdateReal.updatedAt.toISOString()).toBe('2026-09-02T06:30:00.000Z');
  });

  it('[3.2] caracterización ADR-4: correr el mismo SQL una SEGUNDA vez, directo (vía psql), CORROMPE', async () => {
    // Repite la corrida anterior tal cual la ejecutaría `psql` a mano — sin
    // pasar por `_prisma_migrations`. El discriminador de microsegundos NO
    // cambia al restar horas, así que la fila ya corregida vuelve a
    // clasificar como "escrita por Prisma" y se le resta OTRA vez 3h. Este
    // test documenta POR QUÉ la garantía de una-sola-vez tiene que ser
    // externa al SQL (ADR-2): si alguien "simplificara" la guarda pensando
    // que basta con no correr el archivo dos veces, este test falla.
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    await pool.query(sql);

    const corrompida = await leerFechasCliente(pool, idMicrosegundosCero);
    // Segunda resta de 3h sobre el valor YA corregido (07:00) -> 04:00, no
    // el instante real (10:00 original). Los datos quedan peor, no iguales.
    expect(corrompida.createdAt.toISOString()).toBe('2026-09-01T04:00:00.000Z');
    expect(corrompida.updatedAt.toISOString()).toBe('2026-09-01T04:00:00.000Z');

    // El valor escrito por la base sigue intacto — el discriminador nunca
    // lo tocó, ni en la primera corrida ni en esta.
    const intacta = await leerFechasCliente(pool, idMicrosegundosDistintoDeCero);
    expect(intacta.createdAt.toISOString()).toBe('2026-09-01T10:00:00.123Z');
  });
});

describe('migración 20260914150000 — ejecución exactamente-una-vez vía `prisma migrate deploy` (WU3, master, R4)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const dbName = nuevoNombreDbEfimera('unavez');
  let pool: InstanceType<typeof Pool>;

  function correrMigrateDeploy(): void {
    execFileSync(process.execPath, [PRISMA_BIN, 'migrate', 'deploy', '--schema=prisma_master/schema.prisma'], {
      cwd: RUTA_BACKEND,
      env: { ...process.env, DATABASE_URL_MASTER: urlHaciaDb(dbName) },
      stdio: 'pipe',
    });
  }

  beforeAll(async () => {
    await admin.createDatabase(dbName);
  }, 30_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin.dropDatabase(dbName);
  }, 30_000);

  it('[3.2] primer `migrate deploy`: aplica TODO el historial + la migración bajo test, una sola fila propia en _prisma_migrations', async () => {
    correrMigrateDeploy();

    pool = new Pool({ connectionString: urlHaciaDb(dbName) });
    const { rows } = await pool.query(
      'SELECT migration_name, started_at, finished_at FROM _prisma_migrations WHERE migration_name = $1',
      [MIGRATION_UNDER_TEST],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].finished_at).not.toBeNull();
  }, 60_000);

  it('[3.5] el backfill no toca `feriados.fecha` (@db.Date) — solo columnas timestamptz', async () => {
    // Ref catálogo del migration.sql: udt_name = 'timestamptz' excluye por
    // construcción cualquier columna @db.Date. `feriados` ya trae filas
    // sembradas (`20260909130000_seed_feriados_nacionales_inamovibles`).
    // Se compara `fecha::text` (no el `Date` que arma `pg` del lado del
    // cliente, que reinterpreta un DATE con el TZ local del proceso y
    // haría este assert dependiente de dónde corre la suite) contra el
    // valor sembrado, textual y ajeno a cualquier resta de horas.
    const { rows } = await pool.query(
      `SELECT fecha::text AS fecha_texto FROM feriados WHERE fecha = '2026-01-01'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].fecha_texto).toBe('2026-01-01');
  });

  it('[3.2/R4] segundo `migrate deploy` seguido: no-op real — sigue habiendo una sola fila y timestamps del motor sin cambio', async () => {
    const antes = await pool.query(
      'SELECT started_at, finished_at FROM _prisma_migrations WHERE migration_name = $1',
      [MIGRATION_UNDER_TEST],
    );
    const idFixture = await insertarClienteFixture(pool, {
      nombre: 'Fixture WU3 post-deploy (microsegundos=0)',
      dbName: 'test_wu3_post_deploy',
      timestamp: '2026-09-05 08:00:00.000000+00',
    });

    correrMigrateDeploy();

    const despues = await pool.query(
      'SELECT migration_name, started_at, finished_at FROM _prisma_migrations WHERE migration_name = $1',
      [MIGRATION_UNDER_TEST],
    );
    // Sigue habiendo UNA sola fila — la migración no se re-registró.
    expect(despues.rows).toHaveLength(1);
    // `started_at`/`finished_at` los escribe el motor de migraciones al
    // aplicar; si el segundo deploy hubiera re-corrido el archivo, alguno
    // de los dos habría cambiado.
    expect(despues.rows[0].started_at.toISOString()).toBe(
      (antes.rows[0].started_at as Date).toISOString(),
    );
    expect(despues.rows[0].finished_at.toISOString()).toBe(
      (antes.rows[0].finished_at as Date).toISOString(),
    );

    // Y, a diferencia de la caracterización con `psql` directo: la fila
    // insertada DESPUÉS del primer deploy queda intacta, no re-corregida.
    const fixtureIntacta = await leerFechasCliente(pool, idFixture);
    expect(fixtureIntacta.createdAt.toISOString()).toBe('2026-09-05T08:00:00.000Z');
  }, 60_000);
});
