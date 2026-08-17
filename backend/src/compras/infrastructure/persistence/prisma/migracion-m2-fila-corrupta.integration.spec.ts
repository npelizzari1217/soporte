/**
 * migracion-m2-fila-corrupta.integration.spec.ts — S71
 * (sdd/compras-tres-etapas-y-sectores).
 *
 * `rollback-compras-tres-etapas.integration.spec.ts` también cita "S71" en su
 * cabecera, pero cubre otra cosa: la reversibilidad MANUAL de `rollback.sql`
 * una vez que M2 ya se aplicó con éxito. El escenario S71 de la spec es
 * distinto — es sobre lo que pasa cuando M2 se aplica sobre datos que YA
 * están corruptos: una fila donde `cantidad_entregada > cantidad_comprada`,
 * algo que el CHECK viejo (`items_compra_cantidad_entregada_check`, agregado
 * en 20260813130000_compras_schema_checks) ya prohibía, y que por lo tanto
 * "no debería existir" — pero que este spec fuerza a existir para probar que
 * el tercer `VALIDATE CONSTRAINT` de M2 la detecta y frena TODA la migración,
 * sin dejar el schema a medio camino.
 *
 * Estrategia (mismo arnés que `backfill-cantidad-ordenada.integration.spec.ts`):
 *   1. Tenant DB efímera.
 *   2. Se reconstruye el schema PRE-M2 corriendo, en orden, los `migration.sql`
 *      con carpeta anterior a M2.
 *   3. Se siembra una fila con el schema VIEJO que YA viola el CHECK viejo
 *      de `cantidad_entregada`. Como el CHECK lo impediría con un INSERT
 *      normal, se lo dropea, se inserta la fila y se lo vuelve a agregar
 *      `NOT VALID` (mismo nombre, misma definición) — así el propio
 *      `DROP CONSTRAINT "items_compra_cantidad_entregada_check"` que hace
 *      M2 (línea 40 de `migration.sql`) encuentra el constraint donde lo
 *      espera, en vez de romper por un DDL que no puede dropear algo
 *      inexistente (que sería un fallo por la razón equivocada).
 *   4. Se corre el `migration.sql` de M2 tal cual, esperando que rechace.
 *   5. Se assertea:
 *      - que la promesa rechaza (falla explícita, no silenciosa);
 *      - que el mensaje de Postgres nombra el constraint violado;
 *      - que el schema quedó en su estado PRE-migración: `cantidad_ordenada`
 *        y las 3 columnas de fecha NO existen, `cantidad_comprada` sigue
 *        ahí sin renombrar — prueba de que Postgres, al recibir el archivo
 *        completo como un solo mensaje de query simple con múltiples
 *        sentencias separadas por `;`, lo envuelve en una transacción
 *        implícita (el mismo comportamiento que documenta la cabecera de
 *        `migration.sql` para la transacción explícita que arma Prisma).
 *
 * Hallazgo no obvio: el fallo NO ocurre en el `VALIDATE CONSTRAINT`
 * explícito de la línea 43. Ocurre antes, en el `UPDATE` del backfill
 * (línea 18): en Postgres, una vez que un CHECK existe en la tabla —
 * VALID o NOT VALID — CUALQUIER `UPDATE` posterior sobre una fila
 * re-evalúa TODOS los CHECK de esa fila contra su imagen completa, no
 * solo los que referencian las columnas tocadas. `NOT VALID` únicamente
 * salta el escaneo inicial de filas preexistentes al momento del `ADD
 * CONSTRAINT`; no vuelve "dormido" al constraint para escrituras
 * posteriores. Como el `UPDATE` del backfill toca TODAS las filas
 * (incluida la corrupta), el error sale ahí, con el mensaje típico de
 * violación de CHECK en un `UPDATE` ("new row for relation ... violates
 * check constraint ..."), no con el mensaje típico de un `VALIDATE
 * CONSTRAINT` fallido ("check constraint ... is violated by some row").
 * Esto es, de hecho, lo que pasaría en producción: el CHECK viejo real
 * (agregado en 20260813130000, ya `VALID` desde siempre) también sería
 * re-evaluado por ese mismo `UPDATE` antes de llegar a la línea 43. El
 * resultado que le importa a S71 (falla explícita, transacción completa
 * revertida, cero aplicación parcial) se cumple igual — “mismo
 * comportamiento que un VALIDATE CONSTRAINT fallido” en el sentido de la
 * spec (falla dura, transaccional, no silenciosa), aunque el statement
 * puntual que dispara el error sea el `UPDATE`, no el `VALIDATE`.
 *
 * Ref spec: sdd/compras-tres-etapas-y-sectores/spec — Scenario S71 (R12).
 * Ref migración: prisma_tenant/migrations/20260817160000_compras_tres_etapas/migration.sql
 * Ref CHECK viejo: prisma_tenant/migrations/20260813130000_compras_schema_checks/migration.sql
 */
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../prisma_tenant/migrations');
const M2_FOLDER = '20260817160000_compras_tres_etapas';
const M2_MIGRATION_FILE = path.join(MIGRATIONS_DIR, M2_FOLDER, 'migration.sql');

const TENANT_DB_NAME = `soporte_validate_corrupta_m2_${randomBytes(4).toString('hex')}_test`;

/**
 * Corre, EN ORDEN, todos los `migration.sql` con carpeta anterior a M2 —
 * reconstruye el schema exactamente como lo deja `prisma migrate deploy`
 * justo antes de aplicar M2.
 */
async function aplicarMigracionesPreviasAM2(pool: InstanceType<typeof Pool>): Promise<void> {
  const carpetas = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .filter((nombre) => nombre < M2_FOLDER)
    .sort();

  for (const carpeta of carpetas) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, carpeta, 'migration.sql'), 'utf8');
    await pool.query(sql);
  }
}

describe('M2 (compras-tres-etapas-y-sectores) frena ante datos corruptos preexistentes (S71)', () => {
  let pool: InstanceType<typeof Pool>;
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let compraId: string;
  let errorDeMigracion: Error | undefined;

  beforeAll(async () => {
    await admin.createDatabase(TENANT_DB_NAME);

    const prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    const tenantUrl = prismaServiceParaUrl.buildTenantUrl(TENANT_DB_NAME);
    pool = new Pool({ connectionString: tenantUrl });

    await aplicarMigracionesPreviasAM2(pool);

    const ciclo = await pool.query<{ id: string }>(
      `INSERT INTO ciclos_cliente (id, ciclo_vigente_id, nombre, fecha_inicio, fecha_fin, activo, updated_at)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'Ciclo fila corrupta M2', '2026-01-01', '2026-12-31', false, now())
       RETURNING id`,
    );
    const cicloId = ciclo.rows[0]!.id;

    const compra = await pool.query<{ id: string }>(
      `INSERT INTO compras (id, numero, fecha_solicitud, motivo, solicitante_id, ciclo_id, updated_at)
       VALUES (gen_random_uuid(), 'COM-2026-CORRUPTA', '2026-03-01', 'Compra fila corrupta M2', gen_random_uuid(), $1, now())
       RETURNING id`,
      [cicloId],
    );
    compraId = compra.rows[0]!.id;

    // La fila hipotética de S71: cantidad_entregada (8) > cantidad_comprada (5).
    // El CHECK viejo ya lo prohíbe — se dropea temporalmente para poder
    // sembrarla, y se vuelve a agregar NOT VALID (mismo nombre, misma
    // definición) para que M2 encuentre el constraint donde lo espera.
    await pool.query(
      `ALTER TABLE "items_compra" DROP CONSTRAINT "items_compra_cantidad_entregada_check"`,
    );

    await pool.query(
      `INSERT INTO items_compra
         (id, compra_id, descripcion, cantidad, proveedor, monto, fecha_cotizacion,
          cantidad_comprada, cantidad_entregada, updated_at)
       VALUES (gen_random_uuid(), $1, 'Item corrupto (entregada > comprada)', 10.00, 'Proveedor corrupto', 100, '2026-03-01', 5.00, 8.00, now())`,
      [compraId],
    );

    await pool.query(
      `ALTER TABLE "items_compra" ADD CONSTRAINT "items_compra_cantidad_entregada_check" CHECK (
           "cantidad_entregada" >= 0 AND "cantidad_entregada" <= "cantidad_comprada"
       ) NOT VALID`,
    );

    // La migración BAJO TEST — el mismo archivo que corre `prisma migrate
    // deploy`. Se espera que rechace: la fila corrupta viola el tercer
    // VALIDATE CONSTRAINT (cantidad_entregada_check renombrado).
    const sqlM2 = fs.readFileSync(M2_MIGRATION_FILE, 'utf8');
    try {
      await pool.query(sqlM2);
    } catch (error) {
      errorDeMigracion = error as Error;
    }
  }, 60_000);

  afterAll(async () => {
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 30_000);

  it('[CRITICAL] la migración rechaza de forma explícita, no continúa como si la fila fuera válida', () => {
    expect(errorDeMigracion).toBeDefined();
  });

  it('[CRITICAL] el error nombra el constraint violado (mismo comportamiento que un VALIDATE CONSTRAINT fallido)', () => {
    expect(errorDeMigracion?.message).toMatch(/cantidad_entregada_check/);
  });

  it('[CRITICAL] el schema NO quedó a medio aplicar: "cantidad_ordenada" no existe, "cantidad_comprada" sigue ahí sin renombrar', async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'items_compra' AND column_name IN ('cantidad_comprada', 'cantidad_ordenada', 'cantidad_recibida')`,
    );
    const columnas = rows.map((fila) => fila.column_name).sort();
    expect(columnas).toEqual(['cantidad_comprada']);
  });

  it('[CRITICAL] las 3 columnas de fecha que M2 agrega tampoco quedaron aplicadas a medias', async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'items_compra' AND column_name IN ('fecha_orden', 'fecha_recepcion', 'fecha_entrega')`,
    );
    expect(rows).toHaveLength(0);
  });

  it('la fila corrupta sigue en la base tal cual se sembró (rollback no la tocó ni la "arregló")', async () => {
    const { rows } = await pool.query<{ cantidad_comprada: string; cantidad_entregada: string }>(
      'SELECT cantidad_comprada, cantidad_entregada FROM items_compra WHERE compra_id = $1',
      [compraId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.cantidad_comprada).toBe('5.00');
    expect(rows[0]!.cantidad_entregada).toBe('8.00');
  });
});
