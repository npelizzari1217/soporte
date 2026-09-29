/**
 * limpiar-componentes-sin-insumo.integration.spec.ts — WU-1 (sdd catalogo-unico-componentes, ADR-3).
 *
 * Contra Postgres REAL, base de INQUILINO EFÍMERA propia (molde
 * `backfill-correo-clientes.integration.spec.ts`): nunca toca `soporte_master`,
 * `soporte_master_test` ni una base de tenant real, así que no necesita
 * `usarLockMasterTest()`. Reproduce el schema tenant hasta `20260928150000`,
 * o sea el estado previo a la migración que vuelve `insumo_id` NOT NULL.
 *
 * Fixtures: una fila viva y una borrada lógicamente con `insumo_id NULL`, y
 * una vinculada a un insumo. Higiene: limpiar filas -> cerrar pool -> dropDatabase.
 */
import { Pool } from 'pg';
import { vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PostgresAdminService } from '../src/clientes/infrastructure/postgres-admin.service';
import {
  EXIT_CON_FILAS,
  EXIT_ERROR,
  EXIT_OK,
  ejecutarLimpieza,
} from './limpiar-componentes-sin-insumo.mjs';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_MIGRATIONS_DIR = path.resolve(__dirname, '../prisma_tenant/migrations');
const ULTIMA_CARPETA_PREVIA = '20260928150000_calendario_laboral_dias_cliente';
const EPHEMERAL_DB_NAME = `soporte_limpiar_comp_${randomBytes(4).toString('hex')}_test`;
const TENANT = 'tenant_efimero';

/** Corre, en orden, los `migration.sql` con carpeta <= `ULTIMA_CARPETA_PREVIA`. */
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

describe('limpiar-componentes-sin-insumo — reporte y apply verificado (WU-1, tenant efímero)', () => {
  let pool: InstanceType<typeof Pool>;
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const log = vi.fn();
  let vivaId: string;
  let borradaId: string;
  let vinculadaId: string;

  const contar = async (): Promise<number> => {
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM componentes_equipo');
    return rows[0].n as number;
  };

  beforeAll(async () => {
    await admin.createDatabase(EPHEMERAL_DB_NAME);
    const ephemeralUrl = new URL(MASTER_TEST_URL);
    ephemeralUrl.pathname = `/${EPHEMERAL_DB_NAME}`;
    pool = new Pool({ connectionString: ephemeralUrl.toString() });

    await reproducirSchemaPrevio(pool);

    const equipo = await pool.query(
      `INSERT INTO equipos_informaticos (nombre, updated_at)
       VALUES ('Equipo fixture WU1', now()) RETURNING id`,
    );
    const equipoId = equipo.rows[0].id as string;

    const familia = await pool.query(
      `INSERT INTO familias_insumo (codigo, nombre, updated_at)
       VALUES ('FIXWU1', 'Familia fixture WU1', now()) RETURNING id`,
    );
    const unidad = await pool.query(
      `INSERT INTO unidades_medida (codigo, nombre, updated_at)
       VALUES ('FIXWU1', 'Unidad fixture WU1', now()) RETURNING id`,
    );
    const insumo = await pool.query(
      `INSERT INTO insumos (codigo, nombre, familia_id, unidad_medida_id, updated_at)
       VALUES ('INS-FIXWU1', 'Insumo fixture WU1', $1, $2, now()) RETURNING id`,
      [familia.rows[0].id, unidad.rows[0].id],
    );

    const viva = await pool.query(
      `INSERT INTO componentes_equipo (equipo_id, tipo_componente_codigo, updated_at)
       VALUES ($1, 'RAM', now()) RETURNING id`,
      [equipoId],
    );
    vivaId = viva.rows[0].id as string;

    const borrada = await pool.query(
      `INSERT INTO componentes_equipo (equipo_id, tipo_componente_codigo, updated_at, deleted_at)
       VALUES ($1, 'DISCO', now(), now()) RETURNING id`,
      [equipoId],
    );
    borradaId = borrada.rows[0].id as string;

    const vinculada = await pool.query(
      `INSERT INTO componentes_equipo (equipo_id, tipo_componente_codigo, insumo_id, updated_at)
       VALUES ($1, 'RAM', $2, now()) RETURNING id`,
      [equipoId, insumo.rows[0].id],
    );
    vinculadaId = vinculada.rows[0].id as string;
  }, 120_000);

  afterAll(async () => {
    // Orden de higiene: limpiar filas -> cerrar -> dropDatabase (al revés, el DROP falla en silencio).
    await pool.query('DELETE FROM componentes_equipo').catch(() => undefined);
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(EPHEMERAL_DB_NAME);
  }, 30_000);

  beforeEach(() => log.mockClear());

  const tenants = () => [{ dbName: TENANT, pool }];

  it('el reporte cuenta 2 filas (viva y borrada), ignora la vinculada y no borra', async () => {
    const r = await ejecutarLimpieza({ tenants: tenants(), apply: false, log });

    expect(r.exitCode).toBe(EXIT_CON_FILAS);
    const texto = log.mock.calls.map((c) => c[0]).join('\n');
    expect(texto).toContain('Total: 2 (1 vivas, 1 borradas lógicamente)');
    expect(texto).toContain(vivaId);
    expect(texto).toContain(borradaId);
    expect(texto).not.toContain(vinculadaId);
    expect(await contar()).toBe(3);
  });

  it('--apply con un número incorrecto no borra nada', async () => {
    const r = await ejecutarLimpieza({ tenants: tenants(), apply: true, esperadas: 3, log });

    expect(r).toEqual({ exitCode: EXIT_ERROR, borradas: 0 });
    expect(await contar()).toBe(3);
  });

  it('--apply con el número correcto borra solo las 2 con insumo_id NULL', async () => {
    const r = await ejecutarLimpieza({ tenants: tenants(), apply: true, esperadas: 2, log });

    expect(r).toEqual({ exitCode: EXIT_OK, borradas: 2 });
    const { rows } = await pool.query('SELECT id FROM componentes_equipo');
    expect(rows.map((f) => f.id)).toEqual([vinculadaId]);
  });

  it('con la tabla ya limpia el reporte termina en exit 0', async () => {
    const r = await ejecutarLimpieza({ tenants: tenants(), apply: false, log });
    expect(r.exitCode).toBe(EXIT_OK);
  });
});
