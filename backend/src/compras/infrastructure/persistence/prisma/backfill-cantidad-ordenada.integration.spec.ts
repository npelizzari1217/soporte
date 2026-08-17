/**
 * backfill-cantidad-ordenada.integration.spec.ts — fix post-verify C1
 * (sdd/compras-tres-etapas-y-sectores).
 *
 * La migración M2 (`20260817160000_compras_tres_etapas`) tiene un `UPDATE
 * "items_compra" SET "cantidad_ordenada" = "cantidad_comprada"` que es el
 * ÚNICO backfill de datos históricos de todo el cambio, y corre en el mismo
 * script que tres `VALIDATE CONSTRAINT`. Ni `soporte_tenant_test` ni el
 * tenant efímero de los e2e tienen `items_compra` poblada ANTES de que la
 * migración corra (arrancan de una migración `deploy` limpia) — así que en
 * el resto de la suite esa `UPDATE` y esos `VALIDATE` siempre corrieron
 * contra CERO filas. Este spec es la única prueba de que el backfill hace lo
 * que dice sobre datos reales.
 *
 * Estrategia (mismo espíritu que `backfill-matriz-permisos.integration.spec.ts`,
 * adaptado: acá la migración es DDL que muta columnas existentes, no un
 * INSERT puro sobre tablas ya finales):
 *   1. Tenant DB efímera (misma dupla `PostgresAdminService.createDatabase` +
 *      `dropDatabase` que usan los e2e).
 *   2. Se reconstruye el schema TAL COMO QUEDA justo ANTES de M2: se leen y
 *      corren, en orden, los `migration.sql` de `prisma_tenant/migrations`
 *      cuyo nombre de carpeta es lexicográficamente menor al de M2 (el
 *      prefijo timestamp garantiza que el orden alfabético es el orden
 *      cronológico real de Prisma).
 *   3. Se siembra `items_compra` con el schema VIEJO (columna
 *      `cantidad_comprada`, sin `cantidad_ordenada`) con valores variados,
 *      incluidos los 2 bordes del CHECK que M2 agrega
 *      (`cantidad_comprada = 0` y `cantidad_comprada = cantidad`).
 *   4. Se corre el `migration.sql` de M2 tal cual — el mismo archivo que
 *      aplica `prisma migrate deploy` en producción, no una reescritura.
 *   5. Se assertea fila por fila que `cantidad_ordenada` (la nueva columna)
 *      quedó igual a `cantidad_recibida` (la columna renombrada, ex
 *      `cantidad_comprada`), y que los 3 `VALIDATE CONSTRAINT` de M2 quedaron
 *      `convalidated = true` en `pg_constraint` DESPUÉS de validar filas
 *      reales (no una tabla vacía).
 *
 * Ref verify: sdd/compras-tres-etapas-y-sectores/verify-report C1.
 * Ref migración: prisma_tenant/migrations/20260817160000_compras_tres_etapas/migration.sql
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

const TENANT_DB_NAME = `soporte_backfill_m2_${randomBytes(4).toString('hex')}_test`;

/**
 * Corre, EN ORDEN, todos los `migration.sql` con carpeta anterior a M2 —
 * reconstruye el schema exactamente como lo deja `prisma migrate deploy`
 * justo antes de aplicar M2 (mismo criterio que usa Prisma: el prefijo
 * timestamp de la carpeta define el orden).
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

describe('Backfill de cantidad_ordenada — migración M2 (fix post-verify C1)', () => {
  let pool: InstanceType<typeof Pool>;
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let cicloId: string;
  let compraId: string;
  const itemIds: Record<string, string> = {};

  beforeAll(async () => {
    await admin.createDatabase(TENANT_DB_NAME);

    const prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    const tenantUrl = prismaServiceParaUrl.buildTenantUrl(TENANT_DB_NAME);
    pool = new Pool({ connectionString: tenantUrl });

    await aplicarMigracionesPreviasAM2(pool);

    // Fixture mínimo para satisfacer las FKs de items_compra (schema VIEJO:
    // "cantidad_comprada" todavía existe, "cantidad_ordenada" todavía no).
    const ciclo = await pool.query<{ id: string }>(
      `INSERT INTO ciclos_cliente (id, ciclo_vigente_id, nombre, fecha_inicio, fecha_fin, activo, updated_at)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'Ciclo backfill M2', '2026-01-01', '2026-12-31', false, now())
       RETURNING id`,
    );
    cicloId = ciclo.rows[0]!.id;

    const compra = await pool.query<{ id: string }>(
      `INSERT INTO compras (id, numero, fecha_solicitud, motivo, solicitante_id, ciclo_id, updated_at)
       VALUES (gen_random_uuid(), 'COM-2026-BM2', '2026-03-01', 'Compra backfill M2', gen_random_uuid(), $1, now())
       RETURNING id`,
      [cicloId],
    );
    compraId = compra.rows[0]!.id;

    // Valores variados + bordes del CHECK que M2 agrega sobre cantidad_ordenada:
    //   - 'cero':      cantidad_comprada = 0 (borde inferior)
    //   - 'completa':  cantidad_comprada = cantidad (borde superior)
    //   - 'parcial':   valor intermedio, con decimales
    //   - 'entregada': cantidad_comprada = cantidad_entregada (borde del check de entregada tras el rename)
    const filas: Array<[string, string, string, string]> = [
      ['cero', '10.00', '0', '0'],
      ['completa', '10.00', '10.00', '10.00'],
      ['parcial', '20.00', '12.50', '4.25'],
      ['entregada', '8.00', '3.00', '3.00'],
    ];

    for (const [clave, cantidad, cantidadComprada, cantidadEntregada] of filas) {
      const item = await pool.query<{ id: string }>(
        `INSERT INTO items_compra
           (id, compra_id, descripcion, cantidad, proveedor, monto, fecha_cotizacion,
            cantidad_comprada, cantidad_entregada, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'Proveedor backfill M2', 100, '2026-03-01', $4, $5, now())
         RETURNING id`,
        [compraId, `Item ${clave}`, cantidad, cantidadComprada, cantidadEntregada],
      );
      itemIds[clave] = item.rows[0]!.id;
    }

    // La migración BAJO TEST — el mismo archivo que corre `prisma migrate deploy`.
    const sqlM2 = fs.readFileSync(M2_MIGRATION_FILE, 'utf8');
    await pool.query(sqlM2);
  }, 60_000);

  afterAll(async () => {
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 30_000);

  it.each([
    ['cero', '0.00'],
    ['completa', '10.00'],
    ['parcial', '12.50'],
    ['entregada', '3.00'],
  ])(
    '[CRITICAL] fila "%s": cantidad_ordenada quedó igual a cantidad_recibida tras el backfill (%s)',
    async (clave, esperado) => {
      const { rows } = await pool.query<{ cantidad_ordenada: string; cantidad_recibida: string }>(
        'SELECT cantidad_ordenada, cantidad_recibida FROM items_compra WHERE id = $1',
        [itemIds[clave]],
      );
      expect(rows[0]!.cantidad_ordenada).toBe(esperado);
      expect(rows[0]!.cantidad_ordenada).toBe(rows[0]!.cantidad_recibida);
    },
  );

  it('[CRITICAL] las 3 fechas nuevas quedan NULL para todas las filas backfilleadas (S52)', async () => {
    const { rows } = await pool.query<{
      fecha_orden: string | null;
      fecha_recepcion: string | null;
      fecha_entrega: string | null;
    }>(
      'SELECT fecha_orden, fecha_recepcion, fecha_entrega FROM items_compra WHERE compra_id = $1',
      [compraId],
    );
    expect(rows).toHaveLength(4);
    for (const fila of rows) {
      expect(fila.fecha_orden).toBeNull();
      expect(fila.fecha_recepcion).toBeNull();
      expect(fila.fecha_entrega).toBeNull();
    }
  });

  it.each([
    'items_compra_cantidad_ordenada_check',
    'items_compra_cantidad_recibida_check',
    'items_compra_cantidad_entregada_check',
  ])(
    '[CRITICAL] "%s" quedó VALIDATED contra las filas reales sembradas, no una tabla vacía',
    async (nombreConstraint) => {
      const { rows } = await pool.query<{ convalidated: boolean }>(
        'SELECT convalidated FROM pg_constraint WHERE conname = $1',
        [nombreConstraint],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.convalidated).toBe(true);
    },
  );

  it('rechaza (CHECK real) una fila que violaría cantidad_ordenada <= cantidad si se insertara post-migración', async () => {
    await expect(
      pool.query(
        `INSERT INTO items_compra
           (id, compra_id, descripcion, cantidad, proveedor, monto, fecha_cotizacion,
            cantidad_ordenada, cantidad_recibida, cantidad_entregada, updated_at)
         VALUES (gen_random_uuid(), $1, 'Item invalido', 5, 'Proveedor X', 10, '2026-03-01', 6, 0, 0, now())`,
        [compraId],
      ),
    ).rejects.toThrow();
  });
});
