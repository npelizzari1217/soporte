/**
 * [INTEGRATION] Migración `20261025140000_historial_valor_residual`
 * (odd/tasks/historial-valor-residual.md, S3 y S4) contra Postgres REAL, en una base de INQUILINO
 * EFÍMERA propia: schema previo + equipos con los casos del backfill + la migración tal cual está
 * en su carpeta. Después: re-ejecución, rollback y reaplicación.
 *
 * El CHECK de `origen` se compara contra `ORIGENES_VALORACION_EQUIPO` (fuente única).
 * No toca master ni un tenant real: sin `usarLockMasterTest()`.
 * Higiene: limpiar filas -> cerrar pool -> dropDatabase.
 */
import { Pool } from 'pg';
import { randomBytes } from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { ORIGENES_VALORACION_EQUIPO } from '../../../domain/entities/valoracion-equipo';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../prisma_tenant/migrations');
const CARPETA_MIGRACION = '20261025140000_historial_valor_residual';
const EPHEMERAL_DB_NAME = `soporte_hist_valor_${randomBytes(4).toString('hex')}_test`;
const USUARIO = '01900000-0000-7000-8000-0000000000c1';

const leer = (carpeta: string, archivo = 'migration.sql'): string =>
  fs.readFileSync(path.join(TENANT_MIGRATIONS_DIR, carpeta, archivo), 'utf8');

/** Corre, en orden, los `migration.sql` con carpeta ESTRICTAMENTE anterior a la migración bajo prueba. */
async function reproducirSchemaPrevio(pool: InstanceType<typeof Pool>): Promise<void> {
  const carpetas = fs
    .readdirSync(TENANT_MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .filter((nombre) => nombre < CARPETA_MIGRACION)
    .sort();
  for (const carpeta of carpetas) {
    await pool.query(leer(carpeta));
  }
}

/** Los literales entre comillas de la definición de un CHECK, ordenados. */
const literales = (def: string): string[] =>
  [...def.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort();

interface FilaHistorial {
  equipo: string;
  fecha: string;
  importe: string;
  origen: string;
  usuario_id: string | null;
}

describe('migración historial_valor_residual — backfill, re-ejecución y rollback (tenant efímero)', () => {
  let pool: InstanceType<typeof Pool>;
  const admin = new PostgresAdminService(MASTER_TEST_URL);

  /** Inserta un equipo con los montos dados (fechas como `'YYYY-MM-DD'`); devuelve su id. */
  async function equipo(
    nombre: string,
    datos: {
      importe?: number;
      fechaValoracion?: string;
      valorResidual?: number;
      fechaValorResidual?: string;
      borrado?: boolean;
    },
  ): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO equipos_informaticos
         (nombre, importe, fecha_valoracion, valor_residual, fecha_valor_residual, deleted_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now()) RETURNING id`,
      [
        nombre,
        datos.importe ?? null,
        datos.fechaValoracion ?? null,
        datos.valorResidual ?? null,
        datos.fechaValorResidual ?? null,
        datos.borrado ? new Date() : null,
      ],
    );
    return rows[0].id;
  }

  /** El historial completo, con el nombre del equipo y la fecha como texto (sin pasar por `Date`). */
  async function historial(): Promise<FilaHistorial[]> {
    const { rows } = await pool.query<FilaHistorial>(
      `SELECT e.nombre AS equipo, v.fecha::text AS fecha, v.importe::text AS importe, v.origen,
              v.usuario_id
         FROM equipo_valoraciones v JOIN equipos_informaticos e ON e.id = v.equipo_id
        ORDER BY e.nombre, v.fecha`,
    );
    return rows;
  }

  const migracion = (equipoNombre: string, fecha: string, importe: string): FilaHistorial => ({
    equipo: equipoNombre,
    fecha,
    importe,
    origen: 'MIGRACION',
    usuario_id: null,
  });

  /** Lo que el backfill tiene que dejar para los fixtures de `beforeAll`. */
  const BACKFILL: FilaHistorial[] = [
    migracion('A ambos valores', '2026-01-10', '1000.00'),
    migracion('A ambos valores', '2026-06-01', '700.00'),
    migracion('B solo importe', '2026-02-01', '500.50'),
    migracion('C mismo dia', '2026-03-03', '600.00'),
    migracion('E solo valor residual', '2026-04-04', '0.00'),
  ];

  let equipoA: string;

  beforeAll(async () => {
    await admin.createDatabase(EPHEMERAL_DB_NAME);
    const ephemeralUrl = new URL(MASTER_TEST_URL);
    ephemeralUrl.pathname = `/${EPHEMERAL_DB_NAME}`;
    pool = new Pool({ connectionString: ephemeralUrl.toString() });

    await reproducirSchemaPrevio(pool);

    equipoA = await equipo('A ambos valores', {
      importe: 1000,
      fechaValoracion: '2026-01-10',
      valorResidual: 700,
      fechaValorResidual: '2026-06-01',
    });
    await equipo('B solo importe', { importe: 500.5, fechaValoracion: '2026-02-01' });
    // Mismo día: queda el valor residual, como "el último del día" (S3).
    await equipo('C mismo dia', {
      importe: 900,
      fechaValoracion: '2026-03-03',
      valorResidual: 600,
      fechaValorResidual: '2026-03-03',
    });
    // Montos sin fecha: no hay día que registrar.
    await equipo('D montos sin fecha', { importe: 800, valorResidual: 300 });
    // Un valor residual 0 es un valor válido (equipo totalmente depreciado), no una ausencia.
    await equipo('E solo valor residual', { valorResidual: 0, fechaValorResidual: '2026-04-04' });
    await equipo('F sin montos', {});
    // Cargado por error: su ficha ya no se puede abrir.
    await equipo('G borrado', {
      importe: 100,
      fechaValoracion: '2026-05-05',
      valorResidual: 50,
      fechaValorResidual: '2026-05-06',
      borrado: true,
    });

    // Precondición: la tabla todavía no existe (si existiera, el test no probaría la migración).
    const antes = await pool.query(`SELECT to_regclass('equipo_valoraciones') AS tabla`);
    expect(antes.rows[0].tabla).toBeNull();

    await pool.query(leer(CARPETA_MIGRACION));
  }, 120_000);

  afterAll(async () => {
    // Orden de higiene: limpiar filas -> cerrar -> dropDatabase (al revés, el DROP falla en silencio).
    await pool.query('DROP TABLE IF EXISTS equipo_valoraciones').catch(() => undefined);
    await pool.query('DELETE FROM equipos_informaticos').catch(() => undefined);
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(EPHEMERAL_DB_NAME);
  }, 30_000);

  describe('backfill (S4)', () => {
    it('crea una fila por cada monto con fecha, de equipos no borrados, marcada MIGRACION y sin usuario', async () => {
      expect(await historial()).toEqual(BACKFILL);
    });
  });

  describe('constraints', () => {
    it('origen admite exactamente ORIGENES_VALORACION_EQUIPO', async () => {
      const { rows } = await pool.query<{ def: string }>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = $1`,
        ['equipo_valoraciones_origen_check'],
      );
      expect(rows).toHaveLength(1);
      expect(literales(rows[0].def)).toEqual([...ORIGENES_VALORACION_EQUIPO].sort());
    });

    it('rechaza un origen fuera del catálogo', async () => {
      await expect(
        pool.query(
          `INSERT INTO equipo_valoraciones (equipo_id, fecha, importe, origen, updated_at)
           VALUES ($1, '2026-09-09', 1, 'OTRO', now())`,
          [equipoA],
        ),
      ).rejects.toThrow(/equipo_valoraciones_origen_check/);
    });

    it('rechaza una segunda fila del mismo equipo y día (UNIQUE)', async () => {
      await expect(
        pool.query(
          `INSERT INTO equipo_valoraciones (equipo_id, fecha, importe, origen, updated_at)
           VALUES ($1, '2026-06-01', 1, 'MANUAL', now())`,
          [equipoA],
        ),
      ).rejects.toThrow(/equipo_valoraciones_equipo_id_fecha_key/);
    });

    it('un borrado físico del equipo no arrastra su historial (FK RESTRICT)', async () => {
      await expect(
        pool.query('DELETE FROM equipos_informaticos WHERE id = $1', [equipoA]),
      ).rejects.toThrow(/equipo_valoraciones_equipo_id_fkey/);
    });

    it('el listado por equipo ordenado por fecha usa el índice del UNIQUE', async () => {
      const { rows } = await pool.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
          WHERE tablename = 'equipo_valoraciones' AND indexname = 'equipo_valoraciones_equipo_id_fecha_key'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].indexdef).toMatch(/UNIQUE INDEX .* \(equipo_id, fecha\)/);
    });
  });

  describe('re-ejecución, rollback y reaplicación', () => {
    it('re-ejecutar la migración no duplica filas ni pisa una fila MANUAL del mismo día', async () => {
      await pool.query(
        `UPDATE equipo_valoraciones SET importe = 650, origen = 'MANUAL', usuario_id = $2
          WHERE equipo_id = $1 AND fecha = '2026-06-01'`,
        [equipoA, USUARIO],
      );

      await pool.query(leer(CARPETA_MIGRACION));

      const esperado = BACKFILL.map((fila) =>
        fila.equipo === 'A ambos valores' && fila.fecha === '2026-06-01'
          ? { ...fila, importe: '650.00', origen: 'MANUAL', usuario_id: USUARIO }
          : fila,
      );
      expect(await historial()).toEqual(esperado);
    });

    it('rollback.sql borra la tabla, no toca los equipos y es re-ejecutable', async () => {
      await pool.query(leer(CARPETA_MIGRACION, 'rollback.sql'));
      await pool.query(leer(CARPETA_MIGRACION, 'rollback.sql'));

      const tabla = await pool.query(`SELECT to_regclass('equipo_valoraciones') AS tabla`);
      expect(tabla.rows[0].tabla).toBeNull();
      const { rows } = await pool.query<{ importe: string; valor_residual: string }>(
        `SELECT importe::text, valor_residual::text FROM equipos_informaticos WHERE id = $1`,
        [equipoA],
      );
      expect(rows).toEqual([{ importe: '1000.00', valor_residual: '700.00' }]);
    });

    it('reaplicar la migración después del rollback reconstruye el backfill', async () => {
      await pool.query(leer(CARPETA_MIGRACION));

      expect(await historial()).toEqual(BACKFILL);
    });
  });
});
