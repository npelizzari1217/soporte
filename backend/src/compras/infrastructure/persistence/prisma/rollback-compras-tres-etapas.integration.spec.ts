/**
 * rollback-compras-tres-etapas.integration.spec.ts — reversibilidad de la migracion M2 (NO es S71)
 * (sdd/compras-tres-etapas-y-sectores).
 *
 * `rollback.sql` de M2 (`20260817160000_compras_tres_etapas`) existe desde
 * que se escribió la migración pero nunca se ejercitó contra una base real:
 * ni la suite de e2e ni ningún spec lo corren. Este spec es la única
 * verificación de que el rollback hace lo que su propia cabecera promete —
 * y de que el límite que esa misma cabecera documenta (pérdida de
 * `cantidad_ordenada` cuando diverge de `cantidad_recibida`) es real y no
 * una advertencia retórica.
 *
 * Estrategia (mismo espíritu que `backfill-cantidad-ordenada.integration.spec.ts`,
 * pero yendo un paso más allá: además de M2, corre `rollback.sql` sobre el
 * resultado):
 *   1. Tenant DB efímera.
 *   2. Se reconstruye el schema corriendo, en orden, TODOS los `migration.sql`
 *      con carpeta <= la de M2 — incluye M2 mismo, así que la base termina en
 *      el estado POST-migración (el mismo archivo que corre `prisma migrate
 *      deploy` en producción).
 *   3. Se siembran dos filas de `items_compra` con el schema NUEVO
 *      (`cantidad_ordenada` / `cantidad_recibida` ya separadas):
 *        - 'igual': cantidad_ordenada === cantidad_recibida (el invariante
 *          de reversibilidad que pide la cabecera del rollback se cumple).
 *        - 'distinta': cantidad_ordenada > cantidad_recibida (lo pedido
 *          excede lo efectivamente recibido — el caso que la cabecera
 *          advierte como NO seguro de revertir sin pérdida).
 *   4. Se corre `rollback.sql` tal cual — el mismo archivo, no una reescritura.
 *   5. Se assertea:
 *        - el schema volvió a su forma PRE-M2 (columnas, constraints,
 *          catálogo de `operaciones_compra_tipo_check`);
 *        - fila 'igual': `cantidad_comprada` post-rollback quedó en el
 *          mismo valor que tenía `cantidad_ordenada`/`cantidad_recibida`
 *          antes de revertir — reversibilidad exacta y simétrica cuando el
 *          invariante se cumple;
 *        - fila 'distinta': `cantidad_comprada` post-rollback quedó en el
 *          valor de `cantidad_recibida`, NO en el de `cantidad_ordenada` —
 *          el dato de cuánto se había ordenado se pierde, exactamente como
 *          documenta la cabecera de `rollback.sql`. No se ignora ese caso:
 *          se lo ejercita y se lo deja en verde a propósito, como prueba
 *          de que la advertencia es precisa.
 *
 * Nota de alcance: este spec NO cubre S71, aunque el comentario de
 * `migration.sql` invoque ese ID en la línea de los CHECKs. S71 de la spec
 * dice otra cosa: que una fila corrupta (`cantidadEntregada >
 * cantidadComprada`) haga fallar la migración de forma explícita y detenida,
 * sin aplicarla a medias. Eso lo cubre
 * `migracion-m2-fila-corrupta.integration.spec.ts`.
 *
 * Lo que cubre ESTE spec es la reversibilidad MANUAL vía `rollback.sql` una
 * vez que M2 se aplicó con éxito: un artefacto que existía desde WU-17 y que
 * nunca se había ejercitado. Un archivo de rollback que nadie corrió es una
 * promesa, no una red.
 *
 * Se separan a propósito: dejar los dos bajo el mismo ID hacía que alguien
 * leyera "S71 cubierto" y diera por probado un escenario que no lo estaba.
 *
 * Ref migración: prisma_tenant/migrations/20260817160000_compras_tres_etapas/migration.sql
 * Ref rollback:  prisma_tenant/migrations/20260817160000_compras_tres_etapas/rollback.sql
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
const M2_ROLLBACK_FILE = path.join(MIGRATIONS_DIR, M2_FOLDER, 'rollback.sql');

const TENANT_DB_NAME = `soporte_rollback_m2_${randomBytes(4).toString('hex')}_test`;

/**
 * Corre, EN ORDEN, todos los `migration.sql` con carpeta <= M2 (incluye M2) —
 * deja la base en el estado POST-migración, el mismo que produce
 * `prisma migrate deploy` en producción justo antes de que exista un
 * `rollback.sql` para ejercitar.
 */
async function aplicarMigracionesHastaM2Inclusive(pool: InstanceType<typeof Pool>): Promise<void> {
  const carpetas = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .filter((nombre) => nombre <= M2_FOLDER)
    .sort();

  for (const carpeta of carpetas) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, carpeta, 'migration.sql'), 'utf8');
    await pool.query(sql);
  }
}

describe('Rollback de M2 (compras-tres-etapas-y-sectores) — reversibilidad y guardia documentada', () => {
  let pool: InstanceType<typeof Pool>;
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let compraId: string;
  const itemIds: Record<string, string> = {};

  beforeAll(async () => {
    await admin.createDatabase(TENANT_DB_NAME);

    const prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    const tenantUrl = prismaServiceParaUrl.buildTenantUrl(TENANT_DB_NAME);
    pool = new Pool({ connectionString: tenantUrl });

    await aplicarMigracionesHastaM2Inclusive(pool);

    // Fixture con el schema NUEVO (post-M2): cantidad_ordenada/cantidad_recibida
    // ya separadas, tal como quedan luego de un `prisma migrate deploy` real.
    const ciclo = await pool.query<{ id: string }>(
      `INSERT INTO ciclos_cliente (id, ciclo_vigente_id, nombre, fecha_inicio, fecha_fin, activo, updated_at)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'Ciclo rollback M2', '2026-01-01', '2026-12-31', false, now())
       RETURNING id`,
    );
    const cicloId = ciclo.rows[0]!.id;

    const compra = await pool.query<{ id: string }>(
      `INSERT INTO compras (id, numero, fecha_solicitud, motivo, solicitante_id, ciclo_id, updated_at)
       VALUES (gen_random_uuid(), 'COM-2026-RBM2', '2026-03-01', 'Compra rollback M2', gen_random_uuid(), $1, now())
       RETURNING id`,
      [cicloId],
    );
    compraId = compra.rows[0]!.id;

    // 'igual':    cantidad_ordenada === cantidad_recibida → invariante de la
    //             cabecera del rollback se cumple, reversión debe ser exacta.
    // 'distinta': cantidad_ordenada (10) > cantidad_recibida (6) → invariante
    //             NO se cumple, la cabecera documenta pérdida de dato.
    const filas: Array<[string, string, string, string, string]> = [
      ['igual', '10.00', '10.00', '10.00', '5.00'],
      ['distinta', '10.00', '10.00', '6.00', '3.00'],
    ];

    for (const [clave, cantidad, cantidadOrdenada, cantidadRecibida, cantidadEntregada] of filas) {
      const item = await pool.query<{ id: string }>(
        `INSERT INTO items_compra
           (id, compra_id, descripcion, cantidad, proveedor, monto, fecha_cotizacion,
            cantidad_ordenada, cantidad_recibida, cantidad_entregada, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'Proveedor rollback M2', 100, '2026-03-01', $4, $5, $6, now())
         RETURNING id`,
        [
          compraId,
          `Item ${clave}`,
          cantidad,
          cantidadOrdenada,
          cantidadRecibida,
          cantidadEntregada,
        ],
      );
      itemIds[clave] = item.rows[0]!.id;
    }

    // El rollback BAJO TEST — el mismo archivo que se correría manualmente
    // contra producción ante un deploy fallido.
    const sqlRollback = fs.readFileSync(M2_ROLLBACK_FILE, 'utf8');
    await pool.query(sqlRollback);
  }, 60_000);

  afterAll(async () => {
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 30_000);

  it('[CRITICAL] revierte el rename: "cantidad_comprada" vuelve a existir y "cantidad_ordenada" desaparece', async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'items_compra' AND column_name IN ('cantidad_comprada', 'cantidad_ordenada', 'cantidad_recibida')`,
    );
    const columnas = rows.map((fila) => fila.column_name).sort();
    expect(columnas).toEqual(['cantidad_comprada']);
  });

  it('[CRITICAL] elimina las 3 columnas de fecha que M2 había agregado', async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'items_compra' AND column_name IN ('fecha_orden', 'fecha_recepcion', 'fecha_entrega')`,
    );
    expect(rows).toHaveLength(0);
  });

  it('[CRITICAL] restaura el catálogo original de 10 valores en "operaciones_compra_tipo_check" (ORDEN_REGISTRADA ya no es válido)', async () => {
    await expect(
      pool.query(
        `INSERT INTO operaciones_compra (id, compra_id, tipo, usuario_id, detalle)
         VALUES (gen_random_uuid(), $1, 'ORDEN_REGISTRADA', gen_random_uuid(), 'no debería aceptarse post-rollback')`,
        [compraId],
      ),
    ).rejects.toThrow();
  });

  it('[CRITICAL] restaura el CHECK original "items_compra_cantidad_comprada_check" (0 <= cantidad_comprada <= cantidad)', async () => {
    await expect(
      pool.query(
        `INSERT INTO items_compra
           (id, compra_id, descripcion, cantidad, proveedor, monto, fecha_cotizacion,
            cantidad_comprada, cantidad_entregada, updated_at)
         VALUES (gen_random_uuid(), $1, 'Item invalido post-rollback', 5, 'Proveedor X', 10, '2026-03-01', 6, 0, now())`,
        [compraId],
      ),
    ).rejects.toThrow();
  });

  it('[CRITICAL] fila "igual": reversibilidad exacta — cantidad_comprada quedó en 10.00 (sin pérdida, invariante cumplido)', async () => {
    const { rows } = await pool.query<{ cantidad_comprada: string }>(
      'SELECT cantidad_comprada FROM items_compra WHERE id = $1',
      [itemIds['igual']],
    );
    expect(rows[0]!.cantidad_comprada).toBe('10.00');
  });

  it('[CRITICAL] fila "distinta": guardia documentada — cantidad_comprada quedó en 6.00 (cantidad_recibida), NO en 10.00 (cantidad_ordenada): el dato de lo ordenado se pierde', async () => {
    const { rows } = await pool.query<{ cantidad_comprada: string }>(
      'SELECT cantidad_comprada FROM items_compra WHERE id = $1',
      [itemIds['distinta']],
    );
    expect(rows[0]!.cantidad_comprada).toBe('6.00');
    expect(rows[0]!.cantidad_comprada).not.toBe('10.00');
  });
});
