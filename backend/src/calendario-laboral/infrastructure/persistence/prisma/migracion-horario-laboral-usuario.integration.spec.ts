/**
 * [INTEGRATION] Migración `20261026100000_horario_laboral_usuario` (odd/tasks/tiempo-tecnico.md,
 * T1) y su `rollback.sql`, sobre una base de inquilino EFÍMERA migrada con todas las carpetas
 * anteriores.
 *
 * Verifica:
 * - la tabla nace vacía, con PK (`usuario_id`, `dia_semana`) y los mismos CHECK que
 *   `calendario_laboral_dias_cliente`, leídos del catálogo;
 * - los CHECK rechazan un día fuera de 0..6 y cada forma de ventana inválida, y la PK un día
 *   repetido del mismo usuario;
 * - correrla dos veces no falla ni pierde filas;
 * - el rollback borra solo esta tabla, es re-ejecutable y la migración se vuelve a aplicar.
 *
 * Mismo patrón que `migracion-retiro-satelite-edilicia.integration.spec.ts`. No toca master: sin
 * `usarLockMasterTest()`. Higiene: cerrar pool → dropDatabase.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseError, Pool } from 'pg';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../prisma_tenant/migrations');
const MIGRACION = '20261026100000_horario_laboral_usuario';
const CARPETA = path.join(MIGRATIONS_DIR, MIGRACION);
const DB = `soporte_migr_horario_usuario_${randomBytes(4).toString('hex')}_test`;

const USUARIO = '01900000-0000-7000-8000-000000000741';

const leer = (archivo: string): string => fs.readFileSync(path.join(CARPETA, archivo), 'utf8');

describe(`Migración ${MIGRACION}`, () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let pool: InstanceType<typeof Pool>;

  const existe = async (relacion: string): Promise<boolean> =>
    (
      await pool.query<{ existe: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS existe`, [
        relacion,
      ])
    ).rows[0].existe;

  /** Las constraints de una tabla, con el nombre sin el prefijo de la tabla para poder compararlas. */
  async function constraints(tabla: string): Promise<{ sufijo: string; def: string }[]> {
    const r = await pool.query<{ sufijo: string; def: string }>(
      `SELECT substring(conname FROM length($1) + 2) AS sufijo, pg_get_constraintdef(oid) AS def
         FROM pg_constraint
        WHERE conrelid = $1::regclass
        ORDER BY conname`,
      [tabla],
    );
    return r.rows;
  }

  function insertar(
    diaSemana: number,
    aperturaMinuto: number | null,
    cierreMinuto: number | null,
  ): Promise<unknown> {
    return pool.query(
      `INSERT INTO horario_laboral_usuario (usuario_id, dia_semana, apertura_minuto, cierre_minuto, updated_at)
       VALUES ($1, $2, $3, $4, now())`,
      [USUARIO, diaSemana, aperturaMinuto, cierreMinuto],
    );
  }

  /** El error de Postgres de una inserción que debe fallar: código y constraint. */
  async function rechazo(
    diaSemana: number,
    aperturaMinuto: number | null,
    cierreMinuto: number | null,
  ): Promise<{ code: string | undefined; constraint: string | undefined }> {
    try {
      await insertar(diaSemana, aperturaMinuto, cierreMinuto);
    } catch (error) {
      if (error instanceof DatabaseError) {
        return { code: error.code, constraint: error.constraint };
      }
      throw error;
    }
    throw new Error(`La fila (${diaSemana}, ${aperturaMinuto}, ${cierreMinuto}) no fue rechazada`);
  }

  const filas = async (): Promise<unknown[]> =>
    (
      await pool.query(
        `SELECT usuario_id, dia_semana, apertura_minuto, cierre_minuto
           FROM horario_laboral_usuario ORDER BY usuario_id, dia_semana`,
      )
    ).rows;

  beforeAll(async () => {
    await admin.createDatabase(DB);
    pool = new Pool({ connectionString: new PrismaService(MASTER_TEST_URL).buildTenantUrl(DB) });

    const anteriores = fs
      .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name < MIGRACION)
      .map((e) => e.name)
      .sort();
    for (const carpeta of anteriores) {
      await pool.query(
        fs.readFileSync(path.join(MIGRATIONS_DIR, carpeta, 'migration.sql'), 'utf8'),
      );
    }
    expect(await existe('horario_laboral_usuario')).toBe(false);

    await pool.query(leer('migration.sql'));
  }, 120_000);

  afterAll(async () => {
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(DB);
  }, 60_000);

  it('crea la tabla vacía, con PK (usuario_id, dia_semana) y los mismos CHECK que el horario del cliente', async () => {
    expect(await filas()).toEqual([]);

    const propias = await constraints('horario_laboral_usuario');
    expect(propias.find((c) => c.sufijo === 'pkey')?.def).toBe(
      'PRIMARY KEY (usuario_id, dia_semana)',
    );

    const checks = (lista: { sufijo: string; def: string }[]) =>
      lista.filter((c) => c.sufijo.endsWith('_check'));
    expect(checks(propias).map((c) => c.sufijo)).toEqual(['dia_semana_check', 'ventana_check']);
    expect(checks(propias)).toEqual(checks(await constraints('calendario_laboral_dias_cliente')));
  });

  it('acepta un día cerrado y una ventana de 0 a 1440', async () => {
    await insertar(0, null, null);
    await insertar(1, 0, 1440);

    expect(await filas()).toEqual([
      { usuario_id: USUARIO, dia_semana: 0, apertura_minuto: null, cierre_minuto: null },
      { usuario_id: USUARIO, dia_semana: 1, apertura_minuto: 0, cierre_minuto: 1440 },
    ]);
  });

  it.each([
    { caso: 'día 7', dia: 7, constraint: 'horario_laboral_usuario_dia_semana_check' },
    { caso: 'día -1', dia: -1, constraint: 'horario_laboral_usuario_dia_semana_check' },
  ])('rechaza el $caso con su CHECK', async ({ dia, constraint }) => {
    expect(await rechazo(dia, null, null)).toEqual({ code: '23514', constraint });
  });

  it.each([
    { caso: 'solo apertura', apertura: 540, cierre: null },
    { caso: 'solo cierre', apertura: null, cierre: 1080 },
    { caso: 'apertura igual al cierre', apertura: 540, cierre: 540 },
    { caso: 'apertura posterior al cierre', apertura: 1080, cierre: 540 },
    { caso: 'cierre después de 1440', apertura: 540, cierre: 1441 },
    { caso: 'apertura negativa', apertura: -1, cierre: 540 },
  ])('rechaza la ventana con $caso', async ({ apertura, cierre }) => {
    expect(await rechazo(2, apertura, cierre)).toEqual({
      code: '23514',
      constraint: 'horario_laboral_usuario_ventana_check',
    });
  });

  it('rechaza el mismo día dos veces para el mismo usuario', async () => {
    expect(await rechazo(0, 540, 1080)).toEqual({
      code: '23505',
      constraint: 'horario_laboral_usuario_pkey',
    });
  });

  it('correrla otra vez no falla ni pierde filas', async () => {
    const antes = await filas();

    await pool.query(leer('migration.sql'));

    expect(await filas()).toEqual(antes);
  });

  it('el rollback borra solo esta tabla y es re-ejecutable; la migración se vuelve a aplicar', async () => {
    const horarioCliente = (
      await pool.query(`SELECT * FROM calendario_laboral_dias_cliente ORDER BY dia_semana`)
    ).rows;

    await pool.query(leer('rollback.sql'));
    await pool.query(leer('rollback.sql'));

    expect(await existe('horario_laboral_usuario')).toBe(false);
    expect(
      (await pool.query(`SELECT * FROM calendario_laboral_dias_cliente ORDER BY dia_semana`)).rows,
    ).toEqual(horarioCliente);

    await pool.query(leer('migration.sql'));
    expect(await existe('horario_laboral_usuario')).toBe(true);
    expect(await filas()).toEqual([]);
  });
});
