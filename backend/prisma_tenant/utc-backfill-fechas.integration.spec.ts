/**
 * utc-backfill-fechas.integration.spec.ts — WU4 (Phase 4,
 * sdd/sesion-utc-y-backfill-de-fechas), issue #173.
 *
 * Mismo criterio que `prisma_master/utc-backfill-fechas.integration.spec.ts`
 * (WU3): lee el `migration.sql` REAL del disco y lo ejecuta contra Postgres.
 * DB EFÍMERA propia, nunca `soporte_tenant_test`.
 *
 * Ref design: ADR-1, ADR-2, ADR-3 (la SEGUNDA GUARDA es el foco de esta
 * unidad), ADR-4, ADR-7. Ref spec: `fechas-sesion-utc` — R2 (coherencia
 * created/updated), R3 (corrección del dato histórico), R4 (una-sola-vez),
 * R7 (invariantes). Ref tasks: 4.1, 4.2, 4.3, 4.4.
 *
 * HALLAZGO respecto de ADR-3 (documentado también en la cabecera del
 * `migration.sql`): la segunda guarda de ADR-3 dice "las 6 columnas
 * clock_timestamp()... en esas filas created_at lo escribe la base y
 * updated_at lo escribe Prisma", pero `movimientos_insumo` NO TIENE columna
 * `updated_at` (tabla append-only, ver `prisma_tenant/schema.prisma`,
 * modelo `MovimientoInsumo`) — no hay delta que calcular ahí. La migración
 * detecta esto en runtime (no hardcodea la excepción) y esa tabla queda
 * cubierta solo por el discriminador primario, que ahí nunca puede
 * confundirse: el mapper omite `createdAt` a propósito, así que esa columna
 * SIEMPRE la escribe la base. El fixture [4.1-movimientos] prueba
 * exactamente que la migración no revienta al llegar a esa tabla y que su
 * `created_at` se corrige igual que cualquier otra columna sin guarda.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Client, Pool } from 'pg';
import { PostgresAdminService } from '../src/clientes/infrastructure/postgres-admin.service';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const RUTA_BACKEND = path.resolve(__dirname, '..');
const TENANT_MIGRATIONS_DIR = path.resolve(__dirname, './migrations');
// Última carpeta preexistente que este fixture reproduce ANTES de la
// migración bajo test — la más nueva al momento de escribir WU4.
const ULTIMA_CARPETA_PREVIA = '20260912120300_insumos_created_at_clock_timestamp';
const MIGRATION_UNDER_TEST = '20260914150000_sesion_utc_y_backfill_fechas';
const MIGRATION_FILE = path.join(TENANT_MIGRATIONS_DIR, MIGRATION_UNDER_TEST, 'migration.sql');

/* eslint-disable @typescript-eslint/no-require-imports */
const prismaPkgJson = require.resolve('prisma/package.json') as string;
const PRISMA_BIN = path.join(
  path.dirname(prismaPkgJson),
  (require(prismaPkgJson) as { bin: { prisma: string } }).bin.prisma,
);
/* eslint-enable @typescript-eslint/no-require-imports */

function nuevoNombreDbEfimera(sufijo: string): string {
  return `soporte_utc_backfill_tenant_${sufijo}_${randomBytes(4).toString('hex')}_test`;
}

function urlHaciaDb(dbName: string): string {
  const url = new URL(MASTER_TEST_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}

/** Corre, en orden, los `migration.sql` tenant con carpeta <= `ULTIMA_CARPETA_PREVIA`. */
async function reproducirSchemaPrevio(pool: InstanceType<typeof Pool>): Promise<void> {
  const carpetas = fs
    .readdirSync(TENANT_MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .filter((nombre) => nombre <= ULTIMA_CARPETA_PREVIA)
    .sort();

  for (const carpeta of carpetas) {
    const sql = fs.readFileSync(path.join(TENANT_MIGRATIONS_DIR, carpeta, 'migration.sql'), 'utf8');
    await pool.query(sql);
  }
}

describe('migración 20260914150000 — backfill catalogado + segunda guarda de ADR-3 (WU4, tenant)', () => {
  let pool: InstanceType<typeof Pool>;
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const dbName = nuevoNombreDbEfimera('discriminador');

  let idModeloCorregido: string;
  let idModeloBase: string;
  let idFamiliaCorregida: string;
  let idFamiliaBase: string;
  let idUnidadCorregida: string;
  let idUnidadBase: string;
  let idInsumoCorregido: string;
  let idInsumoBase: string;
  let idInsumoAmbiguo: string;
  let idInsumoFirmaReal: string;
  let idCodigoAltCorregido: string;
  let idCodigoAltBase: string;
  let idMovimientoCorregido: string;
  let idMovimientoBase: string;
  let idCicloDate: string;

  const notices: string[] = [];

  beforeAll(async () => {
    await admin.createDatabase(dbName);
    pool = new Pool({ connectionString: urlHaciaDb(dbName) });
    await reproducirSchemaPrevio(pool);

    // ── modelos_equipo ──
    // Corregible: microsegundos=0, delta updated_at-created_at FUERA de
    // banda (~22h, updated_at posterior — actualización real, no el mismo
    // INSERT) — no es el caso ambiguo, se corrige -3h. La traslación de -3h
    // es uniforme sobre created_at Y updated_at (cada uno cataloga aparte),
    // así que el delta entre ambos no cambia y la invariante R7
    // (updated_at >= created_at) se preserva.
    ({
      rows: [{ id: idModeloCorregido }],
    } = await pool.query<{ id: string }>(
      `INSERT INTO modelos_equipo (id, marca, modelo, created_at, updated_at)
       VALUES (gen_random_uuid(), 'WU4-MARCA-CORR', 'WU4-MODELO-CORR', $1::timestamptz, $2::timestamptz)
       RETURNING id`,
      ['2026-09-05 10:00:00.000000+00', '2026-09-06 08:00:00.000000+00'],
    ));
    // Escrito por la base: microsegundos != 0 — nunca se toca.
    ({
      rows: [{ id: idModeloBase }],
    } = await pool.query<{ id: string }>(
      `INSERT INTO modelos_equipo (id, marca, modelo, created_at, updated_at)
       VALUES (gen_random_uuid(), 'WU4-MARCA-BASE', 'WU4-MODELO-BASE', $1::timestamptz, $1::timestamptz)
       RETURNING id`,
      ['2026-09-05 10:00:00.123456+00'],
    ));

    // ── familias_insumo ──
    ({
      rows: [{ id: idFamiliaCorregida }],
    } = await pool.query<{ id: string }>(
      `INSERT INTO familias_insumo (id, codigo, nombre, created_at, updated_at)
       VALUES (gen_random_uuid(), 'WU4-FAM-CORR', 'Familia WU4 corregida', $1::timestamptz, $2::timestamptz)
       RETURNING id`,
      ['2026-09-05 10:00:00.000000+00', '2026-09-06 08:00:00.000000+00'],
    ));
    ({
      rows: [{ id: idFamiliaBase }],
    } = await pool.query<{ id: string }>(
      `INSERT INTO familias_insumo (id, codigo, nombre, created_at, updated_at)
       VALUES (gen_random_uuid(), 'WU4-FAM-BASE', 'Familia WU4 base', $1::timestamptz, $1::timestamptz)
       RETURNING id`,
      ['2026-09-05 10:00:00.123456+00'],
    ));

    // ── unidades_medida ──
    ({
      rows: [{ id: idUnidadCorregida }],
    } = await pool.query<{ id: string }>(
      `INSERT INTO unidades_medida (id, codigo, nombre, created_at, updated_at)
       VALUES (gen_random_uuid(), 'WU4-UM-CORR', 'Unidad WU4 corregida', $1::timestamptz, $2::timestamptz)
       RETURNING id`,
      ['2026-09-05 10:00:00.000000+00', '2026-09-06 08:00:00.000000+00'],
    ));
    ({
      rows: [{ id: idUnidadBase }],
    } = await pool.query<{ id: string }>(
      `INSERT INTO unidades_medida (id, codigo, nombre, created_at, updated_at)
       VALUES (gen_random_uuid(), 'WU4-UM-BASE', 'Unidad WU4 base', $1::timestamptz, $1::timestamptz)
       RETURNING id`,
      ['2026-09-05 10:00:00.123456+00'],
    ));

    // ── insumos — acá vive el caso AMBIGUO (spec `fechas-sesion-utc`, "los
    //    tres insumos conocidos": delta real medido 02:59:59.998391) ──
    ({
      rows: [{ id: idInsumoCorregido }],
    } = await pool.query<{ id: string }>(
      `INSERT INTO insumos (id, codigo, nombre, familia_id, unidad_medida_id, created_at, updated_at)
       VALUES (gen_random_uuid(), 'WU4-INS-CORR', 'Insumo WU4 corregido', $1, $2, $3::timestamptz, $4::timestamptz)
       RETURNING id`,
      [idFamiliaBase, idUnidadBase, '2026-09-05 10:00:00.000000+00', '2026-09-06 08:00:00.000000+00'],
    ));
    ({
      rows: [{ id: idInsumoBase }],
    } = await pool.query<{ id: string }>(
      `INSERT INTO insumos (id, codigo, nombre, familia_id, unidad_medida_id, created_at, updated_at)
       VALUES (gen_random_uuid(), 'WU4-INS-BASE', 'Insumo WU4 base', $1, $2, $3::timestamptz, $3::timestamptz)
       RETURNING id`,
      [idFamiliaBase, idUnidadBase, '2026-09-05 10:00:00.123456+00'],
    ));
    // Ambiguo: microsegundos=0 (parece Prisma) Y delta updated_at-created_at
    // en banda [2:59:55, 3:00:05] (parece base+Prisma en el mismo INSERT).
    // `created_at` NO debe tocarse. `updated_at` SÍ tiene microsegundos=0
    // (WARNING-1, sdd-verify FAIL round 1: la fixture original tenía
    // microsegundos=391, un valor que Prisma NUNCA puede escribir — un
    // `Date` de JS solo tiene resolución de milisegundos — así que la
    // aserción sobre `updated_at` no podía fallar por ninguna vía; con
    // microsegundos=0, `updated_at` participa del paso genérico del
    // discriminador como cualquier columna Prisma y SÍ se corrige -3h,
    // independientemente de que `created_at` se excluya por la guarda).
    ({
      rows: [{ id: idInsumoAmbiguo }],
    } = await pool.query<{ id: string }>(
      `INSERT INTO insumos (id, codigo, nombre, familia_id, unidad_medida_id, created_at, updated_at)
       VALUES (gen_random_uuid(), 'WU4-INS-AMBIG', 'Insumo WU4 ambiguo', $1, $2, $3::timestamptz, $4::timestamptz)
       RETURNING id`,
      [idFamiliaBase, idUnidadBase, '2026-09-12 20:13:00.000000+00', '2026-09-12 23:12:59.998000+00'],
    ));

    // Firma REAL de "los tres insumos conocidos" en producción (CRITICAL-1,
    // sdd-verify FAIL round 1 — fixture faltante). A diferencia del caso
    // ambiguo de arriba, acá `created_at` lo escribe la base
    // (`clock_timestamp()`, microsegundos != 0: el discriminador primario
    // JAMÁS la toca, sin pasar por la guarda de ADR-3 en absoluto) y
    // `updated_at` lo escribe Prisma (microsegundos = 0) en el MISMO
    // INSERT, con el delta real medido en producción: 02:59:59.998391.
    // Tras el backfill, `updated_at` queda apenas ~1.6ms ANTES que
    // `created_at` — no es un error de datos, es el orden real
    // JS-antes-que-`clock_timestamp()`; ver R7 con tolerancia de 1s en
    // `spec.md` y el test `[4.4/R7]` de más abajo.
    ({
      rows: [{ id: idInsumoFirmaReal }],
    } = await pool.query<{ id: string }>(
      `INSERT INTO insumos (id, codigo, nombre, familia_id, unidad_medida_id, created_at, updated_at)
       VALUES (gen_random_uuid(), 'WU-R7-FIRMA-REAL', 'Insumo firma real base+Prisma', $1, $2, $3::timestamptz, $4::timestamptz)
       RETURNING id`,
      [idFamiliaBase, idUnidadBase, '2026-09-12 20:13:00.001609+00', '2026-09-12 23:13:00.000000+00'],
    ));

    // ── insumos_codigos_alternativos ──
    ({
      rows: [{ id: idCodigoAltCorregido }],
    } = await pool.query<{ id: string }>(
      `INSERT INTO insumos_codigos_alternativos (id, insumo_id, codigo, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'WU4-COD-CORR', $2::timestamptz, $3::timestamptz)
       RETURNING id`,
      [idInsumoBase, '2026-09-05 10:00:00.000000+00', '2026-09-06 08:00:00.000000+00'],
    ));
    ({
      rows: [{ id: idCodigoAltBase }],
    } = await pool.query<{ id: string }>(
      `INSERT INTO insumos_codigos_alternativos (id, insumo_id, codigo, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'WU4-COD-BASE', $2::timestamptz, $2::timestamptz)
       RETURNING id`,
      [idInsumoBase, '2026-09-05 10:00:00.123456+00'],
    ));

    // ── movimientos_insumo — SIN updated_at (append-only). La guarda de
    //    delta se salta en runtime para esta tabla puntual (ver cabecera del
    //    archivo); solo corre el discriminador primario. ──
    ({
      rows: [{ id: idMovimientoCorregido }],
    } = await pool.query<{ id: string }>(
      `INSERT INTO movimientos_insumo (id, insumo_id, tipo, cantidad, usuario_id, created_at)
       VALUES (gen_random_uuid(), $1, 'ENTRADA', 5, gen_random_uuid(), $2::timestamptz)
       RETURNING id`,
      // Varios días después del insumo padre (creado 09-05T10:00:00.123):
      // margen suficiente para que la traslación -3h de este `created_at`
      // (microsegundos=0) no lo deje antes del `created_at` del padre.
      [idInsumoBase, '2026-09-08 10:00:00.000000+00'],
    ));
    ({
      rows: [{ id: idMovimientoBase }],
    } = await pool.query<{ id: string }>(
      `INSERT INTO movimientos_insumo (id, insumo_id, tipo, cantidad, usuario_id, created_at)
       VALUES (gen_random_uuid(), $1, 'ENTRADA', 5, gen_random_uuid(), $2::timestamptz)
       RETURNING id`,
      [idInsumoBase, '2026-09-08 10:00:00.123456+00'],
    ));

    // ── ciclos_cliente.fecha_inicio (@db.Date) — WARNING-2, sdd-verify FAIL
    //    round 1: el spec de tenant no afirmaba que las columnas @db.Date
    //    quedan intactas (13 en el schema tenant, contra 3 en master, que sí
    //    lo afirma). La exclusión es estructural (`udt_name = 'timestamptz'`
    //    en el catálogo del migration.sql, verificado en WU3/WU4), pero acá
    //    queda con guarda de regresión propia. ──
    ({
      rows: [{ id: idCicloDate }],
    } = await pool.query<{ id: string }>(
      `INSERT INTO ciclos_cliente (id, ciclo_vigente_id, nombre, fecha_inicio, fecha_fin, created_at, updated_at)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'WU4-CICLO-DATE', $1::date, $2::date, now(), now())
       RETURNING id`,
      ['2026-01-01', '2026-12-31'],
    ));
  }, 60_000);

  afterAll(async () => {
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(dbName);
  }, 30_000);

  it('[4.1/4.2/4.3] corre el migration.sql real una vez: corrige lo de Prisma, deja intacto lo de la base y la fila ambigua, y emite RAISE NOTICE por la ambigua', async () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');

    // `Client` de una sola conexión (no `Pool`) para poder escuchar el
    // evento `notice` de la MISMA sesión que ejecuta el SQL — un `Pool`
    // reparte conexiones y no expone `notice` de forma confiable.
    const client = new Client({ connectionString: urlHaciaDb(dbName) });
    client.on('notice', (notice) => notices.push(notice.message ?? ''));
    await client.connect();
    try {
      await client.query(sql);
    } finally {
      await client.end();
    }

    // modelos_equipo
    const modelo = await pool.query<{ created_at: Date; updated_at: Date }>(
      'SELECT created_at, updated_at FROM modelos_equipo WHERE id = $1',
      [idModeloCorregido],
    );
    expect(modelo.rows[0].created_at.toISOString()).toBe('2026-09-05T07:00:00.000Z');
    const modeloBase = await pool.query<{ created_at: Date }>(
      'SELECT created_at FROM modelos_equipo WHERE id = $1',
      [idModeloBase],
    );
    expect(modeloBase.rows[0].created_at.toISOString()).toBe('2026-09-05T10:00:00.123Z');

    // familias_insumo
    const familia = await pool.query<{ created_at: Date }>(
      'SELECT created_at FROM familias_insumo WHERE id = $1',
      [idFamiliaCorregida],
    );
    expect(familia.rows[0].created_at.toISOString()).toBe('2026-09-05T07:00:00.000Z');
    const familiaBase = await pool.query<{ created_at: Date }>(
      'SELECT created_at FROM familias_insumo WHERE id = $1',
      [idFamiliaBase],
    );
    expect(familiaBase.rows[0].created_at.toISOString()).toBe('2026-09-05T10:00:00.123Z');

    // unidades_medida
    const unidad = await pool.query<{ created_at: Date }>(
      'SELECT created_at FROM unidades_medida WHERE id = $1',
      [idUnidadCorregida],
    );
    expect(unidad.rows[0].created_at.toISOString()).toBe('2026-09-05T07:00:00.000Z');
    const unidadBase = await pool.query<{ created_at: Date }>(
      'SELECT created_at FROM unidades_medida WHERE id = $1',
      [idUnidadBase],
    );
    expect(unidadBase.rows[0].created_at.toISOString()).toBe('2026-09-05T10:00:00.123Z');

    // insumos — el caso corregible y el caso base
    const insumo = await pool.query<{ created_at: Date }>(
      'SELECT created_at FROM insumos WHERE id = $1',
      [idInsumoCorregido],
    );
    expect(insumo.rows[0].created_at.toISOString()).toBe('2026-09-05T07:00:00.000Z');
    const insumoBase = await pool.query<{ created_at: Date }>(
      'SELECT created_at FROM insumos WHERE id = $1',
      [idInsumoBase],
    );
    expect(insumoBase.rows[0].created_at.toISOString()).toBe('2026-09-05T10:00:00.123Z');

    // insumos — el caso AMBIGUO: `created_at` NO se toca (excluido por la
    // guarda de ADR-3); `updated_at` SÍ se corrige -3h (participa del paso
    // genérico del discriminador, ajeno a la guarda de `created_at`).
    const insumoAmbiguo = await pool.query<{ created_at: Date; updated_at: Date }>(
      'SELECT created_at, updated_at FROM insumos WHERE id = $1',
      [idInsumoAmbiguo],
    );
    expect(insumoAmbiguo.rows[0].created_at.toISOString()).toBe('2026-09-12T20:13:00.000Z');
    expect(insumoAmbiguo.rows[0].updated_at.toISOString()).toBe('2026-09-12T20:12:59.998Z');

    // insumos — firma REAL (CRITICAL-1): `created_at` de la base intacto
    // (microsegundos != 0, nunca pasa por la guarda), `updated_at` de
    // Prisma corregido -3h.
    const insumoFirmaReal = await pool.query<{ created_at: Date; updated_at: Date }>(
      'SELECT created_at, updated_at FROM insumos WHERE id = $1',
      [idInsumoFirmaReal],
    );
    expect(insumoFirmaReal.rows[0].created_at.toISOString()).toBe('2026-09-12T20:13:00.001Z');
    expect(insumoFirmaReal.rows[0].updated_at.toISOString()).toBe('2026-09-12T20:13:00.000Z');

    // ciclos_cliente.fecha_inicio (@db.Date) — WARNING-2: intacta. Se
    // compara `::text` (no el `Date` que arma `pg`, que reinterpreta un
    // DATE con el TZ local del proceso), mismo criterio que el spec de
    // master sobre `feriados.fecha`.
    const ciclo = await pool.query<{ fecha_inicio_texto: string }>(
      'SELECT fecha_inicio::text AS fecha_inicio_texto FROM ciclos_cliente WHERE id = $1',
      [idCicloDate],
    );
    expect(ciclo.rows[0].fecha_inicio_texto).toBe('2026-01-01');

    // insumos_codigos_alternativos
    const codigoAlt = await pool.query<{ created_at: Date }>(
      'SELECT created_at FROM insumos_codigos_alternativos WHERE id = $1',
      [idCodigoAltCorregido],
    );
    expect(codigoAlt.rows[0].created_at.toISOString()).toBe('2026-09-05T07:00:00.000Z');
    const codigoAltBase = await pool.query<{ created_at: Date }>(
      'SELECT created_at FROM insumos_codigos_alternativos WHERE id = $1',
      [idCodigoAltBase],
    );
    expect(codigoAltBase.rows[0].created_at.toISOString()).toBe('2026-09-05T10:00:00.123Z');

    // movimientos_insumo — sin updated_at, sin guarda posible: solo el
    // discriminador primario. Si el runtime skip de la guarda estuviera mal
    // (columna updated_at inexistente referenciada), este `client.query(sql)`
    // ya habría lanzado antes de llegar acá.
    const movimiento = await pool.query<{ created_at: Date }>(
      'SELECT created_at FROM movimientos_insumo WHERE id = $1',
      [idMovimientoCorregido],
    );
    expect(movimiento.rows[0].created_at.toISOString()).toBe('2026-09-08T07:00:00.000Z');
    const movimientoBase = await pool.query<{ created_at: Date }>(
      'SELECT created_at FROM movimientos_insumo WHERE id = $1',
      [idMovimientoBase],
    );
    expect(movimientoBase.rows[0].created_at.toISOString()).toBe('2026-09-08T10:00:00.123Z');

    // RAISE NOTICE de la fila ambigua: tabla, columna e id.
    const mensajeAmbiguo = notices.find(
      (m) => m.includes('fila ambigua') && m.includes('insumos') && m.includes(idInsumoAmbiguo),
    );
    expect(mensajeAmbiguo).toBeDefined();
  }, 60_000);

  it('[4.4/R7] invariantes de integridad temporal tras el backfill', async () => {
    // updated_at no anterior a created_at en más de 1s, en las tablas que
    // tienen ambas columnas. Tolerancia de 1s (spec `fechas-sesion-utc`,
    // decisión del dueño 2026-09-14, CRITICAL-1 en sdd-verify FAIL round 1):
    // Prisma calcula `updated_at` en JS milisegundos antes de que la base
    // evalúe `clock_timestamp()` para `created_at` del mismo INSERT, así
    // que un desvío estricto de 0s es inalcanzable por construcción para
    // estas 5 tablas — la fila `idInsumoFirmaReal` de abajo lo demuestra
    // con los números reales medidos en producción.
    for (const tabla of [
      'modelos_equipo',
      'familias_insumo',
      'unidades_medida',
      'insumos',
      'insumos_codigos_alternativos',
    ]) {
      const { rows } = await pool.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM ${tabla} WHERE updated_at < created_at - INTERVAL '1 second'`,
      );
      expect(Number(rows[0].n)).toBe(0);
    }

    // Firma real (CRITICAL-1): el delta es de apenas ~1.6ms (updated_at
    // ANTES que created_at), causado por el orden JS-antes-que-base de la
    // escritura, no por un error del backfill. Cae dentro de la tolerancia
    // de 1s de R7. SIN la tolerancia (aserción estricta `updated_at >=
    // created_at`), esta fila viola R7 de forma reproducible — ver la
    // evidencia RED en `apply-progress` (observado corriendo esta misma
    // aserción con `INTERVAL '0 seconds'` antes de fijar la tolerancia en 1s).
    const firmaReal = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM insumos
        WHERE id = $1 AND updated_at < created_at - INTERVAL '1 second'`,
      [idInsumoFirmaReal],
    );
    expect(Number(firmaReal.rows[0].n)).toBe(0);

    // movimientos_insumo.created_at >= created_at del insumo padre.
    const huerfanos = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM movimientos_insumo m
         JOIN insumos i ON i.id = m.insumo_id
        WHERE m.created_at < i.created_at`,
    );
    expect(Number(huerfanos.rows[0].n)).toBe(0);

    // Ninguna fecha posterior a `now()`.
    for (const [tabla, columnas] of [
      ['modelos_equipo', ['created_at', 'updated_at']],
      ['familias_insumo', ['created_at', 'updated_at']],
      ['unidades_medida', ['created_at', 'updated_at']],
      ['insumos', ['created_at', 'updated_at']],
      ['insumos_codigos_alternativos', ['created_at', 'updated_at']],
      ['movimientos_insumo', ['created_at']],
    ] as const) {
      for (const columna of columnas) {
        const { rows } = await pool.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM ${tabla} WHERE ${columna} > now()`,
        );
        expect(Number(rows[0].n)).toBe(0);
      }
    }
  });
});

describe('migración 20260914150000 — ejecución exactamente-una-vez vía `prisma migrate deploy` (WU4, tenant, R4)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const dbName = nuevoNombreDbEfimera('unavez');
  let pool: InstanceType<typeof Pool>;

  function correrMigrateDeploy(): void {
    execFileSync(
      process.execPath,
      [
        PRISMA_BIN,
        'migrate',
        'deploy',
        '--schema=prisma_tenant/schema.prisma',
        '--config',
        'prisma.tenant.config.ts',
      ],
      {
        cwd: RUTA_BACKEND,
        env: { ...process.env, DATABASE_URL_TENANT: urlHaciaDb(dbName) },
        stdio: 'pipe',
      },
    );
  }

  beforeAll(async () => {
    await admin.createDatabase(dbName);
  }, 30_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin.dropDatabase(dbName);
  }, 30_000);

  it('[R4] primer `migrate deploy`: una sola fila propia en _prisma_migrations; segundo deploy es no-op real', async () => {
    correrMigrateDeploy();

    pool = new Pool({ connectionString: urlHaciaDb(dbName) });
    const primero = await pool.query(
      'SELECT started_at, finished_at FROM _prisma_migrations WHERE migration_name = $1',
      [MIGRATION_UNDER_TEST],
    );
    expect(primero.rows).toHaveLength(1);
    expect(primero.rows[0].finished_at).not.toBeNull();

    correrMigrateDeploy();

    const segundo = await pool.query(
      'SELECT started_at, finished_at FROM _prisma_migrations WHERE migration_name = $1',
      [MIGRATION_UNDER_TEST],
    );
    expect(segundo.rows).toHaveLength(1);
    expect(segundo.rows[0].started_at.toISOString()).toBe(
      (primero.rows[0].started_at as Date).toISOString(),
    );
    expect(segundo.rows[0].finished_at.toISOString()).toBe(
      (primero.rows[0].finished_at as Date).toISOString(),
    );
  }, 90_000);
});

describe('migración 20260914150000 — la guarda de ADR-3 no depende del orden físico de columnas (WU4, tenant, regresión CRITICAL-2)', () => {
  // Base efímera propia y MÍNIMA: una sola tabla llamada `insumos` (mismo
  // nombre que uno de los `tablas_guarda_delta` de la migración, para
  // activar la segunda guarda de ADR-3) con `updated_at` declarada ANTES
  // que `created_at` — el orden físico exacto que, sin el `ORDER BY`
  // agregado tras sdd-verify FAIL round 1, hace que
  // `information_schema.columns` devuelva `updated_at` antes que
  // `created_at` (confirmado empíricamente: sin ORDER BY, Postgres
  // devuelve el orden físico de declaración de columnas). Reproducido
  // corriendo el `migration.sql` PRE-fix contra esta misma tabla: `created_at`
  // pasaba de `2026-09-12T20:13:00.000Z` a `2026-09-12T17:13:00.000Z`
  // (sobre-corrección de -3h irreversible, exactamente lo que ADR-3
  // declara no negociable).
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const dbName = nuevoNombreDbEfimera('orden_catalogo');
  let pool: InstanceType<typeof Pool>;
  let idFilaAmbigua: string;

  beforeAll(async () => {
    await admin.createDatabase(dbName);
    pool = new Pool({ connectionString: urlHaciaDb(dbName) });

    await pool.query(`
      CREATE TABLE insumos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        updated_at timestamptz,
        created_at timestamptz
      )
    `);

    // Misma fila ambigua que el caso [4.1/4.2/4.3]: created_at con
    // microsegundos=0 (parece Prisma) y delta en banda [2:59:55, 3:00:05]
    // (parece base+Prisma en el mismo INSERT). `created_at` NO debe
    // tocarse, sin importar el orden físico de columnas de esta tabla.
    ({
      rows: [{ id: idFilaAmbigua }],
    } = await pool.query<{ id: string }>(
      `INSERT INTO insumos (created_at, updated_at) VALUES ($1::timestamptz, $2::timestamptz) RETURNING id`,
      ['2026-09-12 20:13:00.000000+00', '2026-09-12 23:12:59.998000+00'],
    ));
  }, 30_000);

  afterAll(async () => {
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(dbName);
  }, 30_000);

  it('[CRITICAL-2] created_at ambiguo permanece intacto aunque updated_at esté declarada antes en la tabla', async () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    await pool.query(sql);

    const fila = await pool.query<{ created_at: Date }>(
      'SELECT created_at FROM insumos WHERE id = $1',
      [idFilaAmbigua],
    );
    expect(fila.rows[0].created_at.toISOString()).toBe('2026-09-12T20:13:00.000Z');
  });
});
