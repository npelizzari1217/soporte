/**
 * utc-sesion-round-trip.integration.spec.ts — WU1 (sdd/sesion-utc-y-backfill-de-fechas).
 *
 * RED por la razón correcta (ADR-7): el Docker local corre `TimeZone=UTC` y
 * es ciego al defecto por construcción (`ticket-fecha-cierre-timestamptz.
 * integration.spec.ts:84-101` ya lo deja escrito). Un `SET TIME ZONE` sobre
 * una conexión YA ABIERTA prueba la expresión SQL, pero NO prueba la cadena
 * de conexión — que es justo lo que este cambio corrige. Por eso este spec:
 *
 *   1. Crea una DB efímera (`PostgresAdminService`, mismo patrón que
 *      `tenant-seeder.adapter.integration.spec.ts`).
 *   2. La migra con el schema tenant REAL (`prisma migrate deploy` real, vía
 *      `TenantMigrationRunnerAdapter` — subproceso, no una copia del SQL).
 *   3. Recién ENTONCES aplica `ALTER DATABASE <efímera> SET timezone TO
 *      'America/Sao_Paulo'` — configurada como producción (el VPS corre bajo
 *      esa zona).
 *   4. Abre pools NUEVOS contra la base ya alterada — una sesión nueva
 *      hereda el ajuste; las conexiones abiertas en los pasos 1-2 (que ya se
 *      cerraron) no importan.
 *
 * `PrismaService` se construye pasando la URL master de test como base (solo
 * se usa para host/puerto/credenciales — el pathname se descarta en
 * `getTenantClient`, que arma la URL de la base efímera). El pool de lectura
 * "ground truth" es `pg` crudo: Postgres siempre serializa timestamptz con
 * offset explícito, así que una lectura con `pg` da el instante absoluto
 * real sin importar el TimeZone de sesión — es SOLO el path Prisma
 * (`@prisma/adapter-pg`) el que hoy lo interpreta mal bajo sesión no-UTC.
 *
 * Higiene: nunca toca `soporte_master_test` ni `soporte_tenant_test` (DB
 * 100% propia) — no hace falta `usarLockMasterTest()`. Orden de cierre:
 * `$disconnect()`/`pool.end()` de los clientes de prueba, LUEGO
 * `admin.dropDatabase()`.
 *
 * RED hoy (antes del fix, `prisma.service.ts` construye `pg.Pool` sin
 * `conUtc()`): la escritura mide +10800s, la lectura mide −10800s — no un
 * error de conexión ni de schema. GREEN después de la tarea 1.4.
 *
 * Ref spec: sdd/sesion-utc-y-backfill-de-fechas §"Round-trip de fecha
 * correcto en sesión no-UTC", §"Protección de regresión bajo sesión no-UTC
 * forzada". Ref design: ADR-1, ADR-7. Tarea: 1.1/1.5.
 */
import { randomBytes } from 'node:crypto';
import { Client, Pool } from 'pg';
import { PostgresAdminService } from '../src/clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../src/clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const EPHEMERAL_DB_NAME = `soporte_utc_roundtrip_${randomBytes(4).toString('hex')}_test`;
const ZONA_NO_UTC_DE_PRODUCCION = 'America/Sao_Paulo';

function urlHaciaDb(urlBase: string, nombreDb: string): string {
  const url = new URL(urlBase);
  url.pathname = `/${nombreDb}`;
  return url.toString();
}

/**
 * `ALTER DATABASE ... SET timezone` escribe en `pg_db_role_setting`: una
 * sesión YA ABIERTA no lo ve, hace falta una conexión NUEVA. Por eso corre
 * en un `Client` propio, de un solo uso, contra la base de mantenimiento
 * `postgres` — igual que `PostgresAdminService.openAdminPool()` — y se
 * cierra antes de que este spec abra ningún pool "real" contra la efímera.
 */
async function forzarTimezoneNoUtc(nombreDb: string, zona: string): Promise<void> {
  const client = new Client({ connectionString: urlHaciaDb(MASTER_TEST_URL, 'postgres') });
  await client.connect();
  try {
    // nombreDb sale de EPHEMERAL_DB_NAME (prefijo fijo + hex), nunca de
    // input externo — mismo criterio de confianza que el resto de los specs
    // de este repo que arman DDL con el nombre de la DB efímera propia.
    await client.query(`ALTER DATABASE "${nombreDb}" SET timezone TO '${zona}'`);
  } finally {
    await client.end();
  }
}

describe('Sesión Postgres UTC — round-trip Prisma↔pg bajo sesión America/Sao_Paulo (WU1, ADR-7)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let prismaService: PrismaService;
  let groundTruthPool: Pool;

  beforeAll(async () => {
    await admin.createDatabase(EPHEMERAL_DB_NAME);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(EPHEMERAL_DB_NAME);

    // Base efímera configurada COMO PRODUCCIÓN (ADR-7): recién después de
    // este ALTER se abren los pools que este spec mide.
    await forzarTimezoneNoUtc(EPHEMERAL_DB_NAME, ZONA_NO_UTC_DE_PRODUCCION);

    // `masterUrl` acá solo aporta host/puerto/credenciales — PrismaService
    // arma la URL real del tenant en getTenantClient() vía buildTenantUrl().
    prismaService = new PrismaService(MASTER_TEST_URL);

    // Pool "ground truth": pg crudo, SIN conUtc() — intencional (ADR-7), lee
    // el instante absoluto real sin pasar por el driver de Prisma.
    groundTruthPool = new Pool({ connectionString: urlHaciaDb(MASTER_TEST_URL, EPHEMERAL_DB_NAME) });
  }, 60_000);

  afterAll(async () => {
    await prismaService.onModuleDestroy();
    await groundTruthPool.end();
    await admin.dropDatabase(EPHEMERAL_DB_NAME);
  }, 30_000);

  it('[R1] escribe un Date vía Prisma y el valor guardado en la base coincide (desvío 0)', async () => {
    const tenantClient = prismaService.getTenantClient(EPHEMERAL_DB_NAME);
    const fechaEscrita = new Date('2026-09-14T09:31:01.231Z');

    const creado = await tenantClient.unidadMedida.create({
      data: { codigo: 'WU1RT-ESCRITURA', nombre: 'Unidad test WU1 escritura', createdAt: fechaEscrita },
    });

    const { rows } = await groundTruthPool.query<{ created_at: Date }>(
      'SELECT created_at FROM unidades_medida WHERE id = $1',
      [creado.id],
    );

    const desvioSegundos = (rows[0].created_at.getTime() - fechaEscrita.getTime()) / 1000;
    expect(desvioSegundos).toBe(0);
  });

  it('[R1/R7] lee una columna DEFAULT clock_timestamp() vía Prisma y el valor devuelto coincide (desvío 0)', async () => {
    // Insert vía pg crudo: la base calcula clock_timestamp() sola, ningún
    // valor de JavaScript cruza el driver en esta escritura.
    const insertado = await groundTruthPool.query<{ id: string; created_at: Date }>(
      `INSERT INTO unidades_medida (id, codigo, nombre, activo, updated_at)
       VALUES (gen_random_uuid(), 'WU1RT-LECTURA', 'Unidad test WU1 lectura', true, clock_timestamp())
       RETURNING id, created_at`,
    );
    const { id, created_at: groundTruth } = insertado.rows[0];

    const tenantClient = prismaService.getTenantClient(EPHEMERAL_DB_NAME);
    const leido = await tenantClient.unidadMedida.findUniqueOrThrow({ where: { id } });

    const desvioSegundos = (leido.createdAt.getTime() - groundTruth.getTime()) / 1000;
    expect(desvioSegundos).toBe(0);
  });
});
