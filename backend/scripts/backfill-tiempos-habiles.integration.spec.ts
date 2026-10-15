/**
 * backfill-tiempos-habiles.integration.spec.ts — T4 de odd/promedios-dashboard-habiles (CA4).
 *
 * Contra Postgres REAL, en un tenant efímero propio con todas las migraciones: el ensayo no
 * escribe, `--apply` completa solo las NULL con el último paso a RESUELTO del historial (no
 * `fecha_cierre`) y los feriados de master + tenant, y una segunda corrida no cambia nada.
 * El cálculo y el mapper se pasan desde el código fuente: el script los toma de `dist/`.
 */
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { PostgresAdminService } from '../src/clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../src/clientes/infrastructure/tenant-migration-runner.adapter';
import { CalcularSlaHabilVenceService } from '../src/calendario-laboral/domain/services/calcular-sla-habil-vence.service';
import { PrismaCalendarioLaboralMapper } from '../src/calendario-laboral/infrastructure/persistence/prisma/prisma-calendario-laboral.mapper';
import { backfillTenant, formatearResultado, parsearArgs } from './backfill-tiempos-habiles.mjs';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_DB_NAME = `soporte_prov_bfhabil_${randomBytes(4).toString('hex')}_test`;
const H = 3600;
/** Instante local (UTC-3) de un día de agosto de 2026 (lunes = 10, jueves = 13). */
const L = (dia: number, hora: number): Date => new Date(Date.UTC(2026, 7, dia, hora + 3));
/** Feriado global (master) como lo devuelve `leerFeriadosGlobales`: medianoche UTC. */
const FERIADO_GLOBAL = { fecha: new Date('2026-08-14T00:00:00.000Z') };

function buildTenantUrl(dbName: string): string {
  const url = new URL(MASTER_TEST_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}

describe('backfill-tiempos-habiles — por tenant (tenant efímero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const migrationRunner = new TenantMigrationRunnerAdapter(MASTER_TEST_URL);
  let client: Client;
  let tipoId: string;
  let prioridadId: string;
  let tipoOpId: string;
  const estados: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let contador = 0;

  const correr = (aplicar: boolean) =>
    backfillTenant({
      pool: client,
      feriadosGlobales: [FERIADO_GLOBAL],
      calculo: new CalcularSlaHabilVenceService(),
      mapper: PrismaCalendarioLaboralMapper,
      aplicar,
    });

  async function ticket(
    nombre: string,
    p: {
      estado: string;
      creado: Date;
      resolucion?: number;
      primeraRespuestaAt?: Date;
      primeraRespuestaHabilS?: number;
    },
  ): Promise<void> {
    contador += 1;
    ids[nombre] = (
      await client.query(
        `INSERT INTO tickets (id, numero, titulo, tipo_id, estado_id, prioridad_id, solicitante_id,
                              created_at, fecha_cierre, resolucion_habil_s, primera_respuesta_at,
                              primera_respuesta_habil_s, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, gen_random_uuid(), $6, $7, $8, $9, $10, now())
         RETURNING id`,
        [
          `BFH-${contador}`,
          nombre,
          tipoId,
          estados[p.estado],
          prioridadId,
          p.creado,
          // `fecha_cierre` muy posterior: si el script la usara, el valor no coincidiría.
          new Date('2026-09-30T12:00:00.000Z'),
          p.resolucion ?? null,
          p.primeraRespuestaAt ?? null,
          p.primeraRespuestaHabilS ?? null,
        ],
      )
    ).rows[0].id as string;
  }

  async function transicion(nombre: string, anterior: string, nuevo: string, cuando: Date) {
    await client.query(
      `INSERT INTO operaciones_ticket (id, ticket_id, tipo_operacion_id, estado_anterior_id,
                                       estado_nuevo_id, autor_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, gen_random_uuid(), $5, now())`,
      [ids[nombre], tipoOpId, estados[anterior], estados[nuevo], cuando],
    );
  }

  const columnas = async (): Promise<Record<string, unknown>> => {
    const r = await client.query(
      `SELECT titulo, resolucion_habil_s, primera_respuesta_habil_s FROM tickets ORDER BY titulo`,
    );
    return Object.fromEntries(
      r.rows.map((x) => [x.titulo, [x.resolucion_habil_s, x.primera_respuesta_habil_s]]),
    );
  };

  beforeAll(async () => {
    await admin.createDatabase(TENANT_DB_NAME);
    await migrationRunner.run(TENANT_DB_NAME);
    client = new Client({ connectionString: buildTenantUrl(TENANT_DB_NAME) });
    await client.connect();
    // L-V 09:00-18:00, fin de semana cerrado, fijado acá para no depender del default sembrado.
    await client.query(
      `UPDATE calendario_laboral_dias_cliente
          SET apertura_minuto = CASE WHEN dia_semana BETWEEN 1 AND 5 THEN 540 END,
              cierre_minuto = CASE WHEN dia_semana BETWEEN 1 AND 5 THEN 1080 END`,
    );
    await client.query(
      `INSERT INTO feriados_cliente (id, fecha, descripcion, updated_at)
       VALUES (gen_random_uuid(), '2026-08-17', 'Feriado propio', now())`,
    );
    prioridadId = (
      await client.query(
        `INSERT INTO prioridades (id, codigo, nombre, updated_at)
         VALUES (gen_random_uuid(), 'T_BFH', 'Prioridad BFH', now()) RETURNING id`,
      )
    ).rows[0].id as string;
    tipoId = (
      await client.query(
        `INSERT INTO tipos_ticket (id, codigo, nombre, modulo, updated_at)
         VALUES (gen_random_uuid(), 'T_BFH_SOP', 'Soporte BFH', 'SOPORTE', now()) RETURNING id`,
      )
    ).rows[0].id as string;
    await client.query(
      `INSERT INTO tipo_operacion (id, codigo, nombre, updated_at)
       VALUES (gen_random_uuid(), 'CAMBIO_ESTADO', 'Cambio de estado', now())
       ON CONFLICT (codigo) DO NOTHING`,
    );
    tipoOpId = (await client.query(`SELECT id FROM tipo_operacion WHERE codigo = 'CAMBIO_ESTADO'`))
      .rows[0].id as string;
    for (const codigo of ['EN_PROCESO', 'RESUELTO', 'CERRADO']) {
      await client.query(
        `INSERT INTO estados (id, codigo, nombre, updated_at)
         VALUES (gen_random_uuid(), $1, $1, now()) ON CONFLICT (codigo) DO NOTHING`,
        [codigo],
      );
      estados[codigo] = (await client.query(`SELECT id FROM estados WHERE codigo = $1`, [codigo]))
        .rows[0].id as string;
    }

    // Reabierto y vuelto a resolver: cuenta el ÚLTIMO paso a RESUELTO (martes 11:00).
    await ticket('a-reabierto', {
      estado: 'CERRADO',
      creado: L(10, 9),
      primeraRespuestaAt: L(11, 10),
    });
    await transicion('a-reabierto', 'EN_PROCESO', 'RESUELTO', L(10, 12));
    await transicion('a-reabierto', 'RESUELTO', 'EN_PROCESO', L(10, 15));
    await transicion('a-reabierto', 'EN_PROCESO', 'RESUELTO', L(11, 11));
    await transicion('a-reabierto', 'RESUELTO', 'CERRADO', L(12, 9));
    // Jueves 13 → martes 18 12:00, con viernes 14 feriado global y lunes 17 feriado propio.
    await ticket('b-feriados', { estado: 'RESUELTO', creado: L(13, 9) });
    await transicion('b-feriados', 'EN_PROCESO', 'RESUELTO', L(18, 12));
    // Ya completos: no se tocan.
    await ticket('c-ya-guardado', {
      estado: 'RESUELTO',
      creado: L(10, 9),
      resolucion: 777,
      primeraRespuestaAt: L(10, 10),
      primeraRespuestaHabilS: 5,
    });
    await transicion('c-ya-guardado', 'EN_PROCESO', 'RESUELTO', L(10, 12));
    // CERRADO sin paso a RESUELTO en el historial: se saltea.
    await ticket('d-sin-historial', { estado: 'CERRADO', creado: L(10, 9) });
    // Abierto: no es resolución.
    await ticket('e-abierto', { estado: 'EN_PROCESO', creado: L(10, 9) });
  }, 60_000);

  afterAll(async () => {
    await client.end();
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 60_000);

  it('el ensayo informa cuántas filas tocaría y no escribe', async () => {
    const antes = await columnas();

    const r = await correr(false);

    expect(r).toEqual({
      resolucion: { aActualizar: 2, actualizados: 0, salteados: 1 },
      primeraRespuesta: { aActualizar: 1, actualizados: 0 },
    });
    expect(await columnas()).toEqual(antes);
    expect(formatearResultado('soporte_x', r, false)).toBe(
      '[backfill-tiempos-habiles] soporte_x: resolucion actualizaria 2, salteados 1 ' +
        '(sin paso a RESUELTO en el historial) | primera respuesta actualizaria 1',
    );
  });

  it('--apply completa solo las NULL, con el último paso a RESUELTO y los feriados de master y tenant', async () => {
    const r = await correr(true);

    expect(r).toEqual({
      resolucion: { aActualizar: 2, actualizados: 2, salteados: 1 },
      primeraRespuesta: { aActualizar: 1, actualizados: 1 },
    });
    expect(await columnas()).toEqual({
      // Lunes 9 h + martes 2 h; primera respuesta lunes 9 h + martes 1 h.
      'a-reabierto': [11 * H, 10 * H],
      // Jueves 9 h + martes 3 h: viernes y lunes son feriados.
      'b-feriados': [12 * H, null],
      'c-ya-guardado': [777, 5],
      'd-sin-historial': [null, null],
      'e-abierto': [null, null],
    });
  });

  it('una segunda corrida con --apply no cambia nada', async () => {
    const antes = await columnas();

    const r = await correr(true);

    expect(r).toEqual({
      resolucion: { aActualizar: 0, actualizados: 0, salteados: 1 },
      primeraRespuesta: { aActualizar: 0, actualizados: 0 },
    });
    expect(await columnas()).toEqual(antes);
  });

  it('un ticket que se reabre entre la lectura y la escritura no recibe tiempo de resolución', async () => {
    await ticket('f-reabierto-en-carrera', { estado: 'RESUELTO', creado: L(10, 9) });
    await transicion('f-reabierto-en-carrera', 'EN_PROCESO', 'RESUELTO', L(10, 12));
    // El ticket se lee RESUELTO y alguien lo reabre justo antes del UPDATE por lotes.
    const pool = {
      query: async (sql: string, params?: unknown[]) => {
        if (sql.includes('SET "resolucion_habil_s"')) {
          await client.query(`UPDATE tickets SET estado_id = $1 WHERE id = $2`, [
            estados.EN_PROCESO,
            ids['f-reabierto-en-carrera'],
          ]);
        }
        return client.query(sql, params);
      },
    };

    const r = await backfillTenant({
      pool,
      feriadosGlobales: [FERIADO_GLOBAL],
      calculo: new CalcularSlaHabilVenceService(),
      mapper: PrismaCalendarioLaboralMapper,
      aplicar: true,
    });

    expect(r.resolucion).toEqual({ aActualizar: 1, actualizados: 0, salteados: 1 });
    expect((await columnas())['f-reabierto-en-carrera']).toEqual([null, null]);
  });

  it('parsearArgs: ensayo por defecto, --apply escribe, cualquier otro argumento aborta', () => {
    expect(parsearArgs([])).toEqual({ aplicar: false });
    expect(parsearArgs(['--apply'])).toEqual({ aplicar: true });
    expect(() => parsearArgs(['--aplicar'])).toThrow(/argumento desconocido: --aplicar/);
  });
});
