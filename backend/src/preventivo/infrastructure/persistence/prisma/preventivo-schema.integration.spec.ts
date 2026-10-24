/**
 * preventivo-schema.integration.spec.ts — WU-2 (sdd/preventivo).
 *
 * Un `it` por CADA CHECK/UNIQUE de la migración `20260825110000_preventivo_planes`
 * (design, sección "Modelo de datos y migraciones"). Cada constraint se
 * prueba intentando el INSERT/UPDATE raw que lo viola y esperando el
 * rechazo de Postgres — la autoridad es la DB, no la lectura del DDL (mismo
 * criterio que `prisma_tenant/compras-checks.integration.spec.ts`).
 *
 * TENANT EFÍMERO: DB física creada/migrada/borrada por este spec vía
 * `PostgresAdminService`/`TenantMigrationRunnerAdapter` (mismo patrón que
 * `prisma-compra-repository.aislamiento.integration.spec.ts`) — NUNCA la
 * `soporte_tenant_test` compartida. Higiene, en este orden: cerrar la
 * conexión (`client.end()`) ANTES de `dropDatabase` — al revés, el pool
 * sigue vivo y Postgres rechaza el DROP en silencio, dejando la base
 * huérfana.
 *
 * Usa un cliente `pg` crudo (no Prisma): el dominio (PlanPreventivoEntity)
 * recién se construye en WU-3 — acá el sujeto bajo prueba es la restricción
 * de integridad de la base, no la validación de aplicación.
 *
 * Ref spec: sdd/preventivo/spec — "Objetivo excluyente del plan" [R1],
 * "Idempotencia por clave de base, no por lectura previa" [R6].
 * Ref tasks: sdd/preventivo/tasks WU-2 (2.5, 2.6, 2.7).
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { RESULTADOS_GENERACION } from '../../../domain/ports/i-preventivo-generacion.repository';
import {
  DIAS_POR_MES_ANTICIPACION,
  UNIDADES_INTERVALO,
} from '../../../domain/entities/plan-preventivo.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_prevschema_${randomBytes(4).toString('hex')}_test`;
const MIGRACION_ANTICIPACION = join(
  __dirname,
  '../../../../../prisma_tenant/migrations/20261025100000_preventivo_anticipacion',
);
const sqlAnticipacion = (archivo: string): string =>
  readFileSync(join(MIGRACION_ANTICIPACION, archivo), 'utf8');

/**
 * Tipo de ticket de los planes del spec (odd/preventivo-por-tipo: `tipo_id` es NOT NULL). Subconsulta
 * por código para no renumerar los parámetros de cada INSERT.
 */
const SQL_TIPO_PLAN = "(SELECT id FROM tipos_ticket WHERE codigo = 'TEST_PREV_MANTENIMIENTO')";

/** Deriva la URL del tenant efímero reemplazando el nombre de DB en `MASTER_TEST_URL`. */
function buildTenantUrl(dbName: string): string {
  const url = new URL(MASTER_TEST_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}

describe('Schema preventivo — CHECKs e idempotencia (WU-2, tenant efímero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const migrationRunner = new TenantMigrationRunnerAdapter(MASTER_TEST_URL);
  let client: Client;

  let prioridadId: string;
  let equipoId: string;
  let estadoId: string;
  let tipoId: string;

  let planCounter = 0;
  let ticketCounter = 0;

  beforeAll(async () => {
    // DB física efímera, real, migrada — NUNCA soporte_master* ni soporte_tenant_test.
    await admin.createDatabase(TENANT_DB_NAME);
    await migrationRunner.run(TENANT_DB_NAME);

    client = new Client({ connectionString: buildTenantUrl(TENANT_DB_NAME) });
    await client.connect();

    const prioridad = await client.query(
      `INSERT INTO prioridades (id, codigo, nombre, updated_at)
       VALUES (gen_random_uuid(), 'TEST_PREV', 'Prioridad test preventivo', now())
       RETURNING id`,
    );
    prioridadId = prioridad.rows[0].id as string;

    const equipo = await client.query(
      `INSERT INTO equipos_informaticos (id, nombre, updated_at)
       VALUES (gen_random_uuid(), 'Equipo test preventivo', now())
       RETURNING id`,
    );
    equipoId = equipo.rows[0].id as string;

    const estado = await client.query(
      `INSERT INTO estados (id, codigo, nombre, updated_at)
       VALUES (gen_random_uuid(), 'TEST_PREV_NUEVO', 'Nuevo test preventivo', now())
       RETURNING id`,
    );
    estadoId = estado.rows[0].id as string;

    const tipo = await client.query(
      `INSERT INTO tipos_ticket (id, codigo, nombre, modulo, updated_at)
       VALUES (gen_random_uuid(), 'TEST_PREV_MANTENIMIENTO', 'Mantenimiento test preventivo', 'TICKETS', now())
       RETURNING id`,
    );
    tipoId = tipo.rows[0].id as string;
  }, 60_000);

  afterAll(async () => {
    // Sin filas que limpiar: la DB entera es efímera y propia de este spec.
    await client.end();
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 60_000);

  /** Inserta un plan preventivo VÁLIDO en todo lo demás — aísla la violación al CHECK bajo prueba. */
  async function insertPlanValido(
    overrides: { equipoId?: string | null; ubicacion?: string | null } = {},
  ): Promise<string> {
    planCounter += 1;
    const equipo = overrides.equipoId === undefined ? equipoId : overrides.equipoId;
    const ubicacion = overrides.ubicacion === undefined ? null : overrides.ubicacion;
    const result = await client.query(
      `INSERT INTO planes_preventivo
         (id, titulo, equipo_id, ubicacion, prioridad_id, tipo_id, responsable_id,
          intervalo_valor, intervalo_unidad, fecha_inicio, proxima_ejecucion_en, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, ${SQL_TIPO_PLAN}, gen_random_uuid(), 7, 'DIAS', '2026-01-01', '2026-01-08', now())
       RETURNING id`,
      [`Plan test preventivo ${planCounter}`, equipo, ubicacion, prioridadId],
    );
    return result.rows[0].id as string;
  }

  /** Inserta un ticket VÁLIDO — necesario para satisfacer la FK de preventivo_generacion.ticket_id. */
  async function insertTicket(): Promise<string> {
    ticketCounter += 1;
    const result = await client.query(
      `INSERT INTO tickets (id, numero, titulo, tipo_id, estado_id, prioridad_id, solicitante_id, updated_at)
       VALUES (gen_random_uuid(), $1, 'Ticket test preventivo', $2, $3, $4, gen_random_uuid(), now())
       RETURNING id`,
      [`MAN-TESTPREV-${ticketCounter}`, tipoId, estadoId, prioridadId],
    );
    return result.rows[0].id as string;
  }

  // ─── planes_preventivo_objetivo_check (XOR, [R1]) ─────────────────────────

  describe('CHECK planes_preventivo_objetivo_check ([R1] objetivo excluyente)', () => {
    it('rechaza equipo_id Y ubicacion seteados a la vez', async () => {
      await expect(insertPlanValido({ equipoId, ubicacion: 'SEDE CENTRAL' })).rejects.toThrow(
        /planes_preventivo_objetivo_check|check constraint/i,
      );
    });

    it('rechaza ni equipo_id ni ubicacion seteados', async () => {
      await expect(insertPlanValido({ equipoId: null, ubicacion: null })).rejects.toThrow(
        /planes_preventivo_objetivo_check|check constraint/i,
      );
    });

    it('acepta solo equipo_id seteado', async () => {
      const id = await insertPlanValido({ equipoId, ubicacion: null });
      expect(id).toBeDefined();
    });

    it('acepta solo ubicacion seteada', async () => {
      const id = await insertPlanValido({ equipoId: null, ubicacion: 'SEDE CENTRAL' });
      expect(id).toBeDefined();
    });
  });

  // ─── planes_preventivo_intervalo_valor_check ──────────────────────────────

  describe('CHECK planes_preventivo_intervalo_valor_check', () => {
    it('rechaza intervalo_valor = 0', async () => {
      await expect(
        client.query(
          `INSERT INTO planes_preventivo
             (id, titulo, ubicacion, prioridad_id, tipo_id, responsable_id, intervalo_valor, intervalo_unidad, fecha_inicio, proxima_ejecucion_en, updated_at)
           VALUES (gen_random_uuid(), 'Plan intervalo cero', 'SEDE CENTRAL', $1, ${SQL_TIPO_PLAN}, gen_random_uuid(), 0, 'DIAS', '2026-01-01', '2026-01-08', now())`,
          [prioridadId],
        ),
      ).rejects.toThrow(/planes_preventivo_intervalo_valor_check|check constraint/i);
    });

    it('rechaza intervalo_valor negativo', async () => {
      await expect(
        client.query(
          `INSERT INTO planes_preventivo
             (id, titulo, ubicacion, prioridad_id, tipo_id, responsable_id, intervalo_valor, intervalo_unidad, fecha_inicio, proxima_ejecucion_en, updated_at)
           VALUES (gen_random_uuid(), 'Plan intervalo negativo', 'SEDE CENTRAL', $1, ${SQL_TIPO_PLAN}, gen_random_uuid(), -1, 'DIAS', '2026-01-01', '2026-01-08', now())`,
          [prioridadId],
        ),
      ).rejects.toThrow(/planes_preventivo_intervalo_valor_check|check constraint/i);
    });
  });

  // ─── planes_preventivo_intervalo_unidad_check ─────────────────────────────

  describe('CHECK planes_preventivo_intervalo_unidad_check', () => {
    it('rechaza una unidad fuera del catálogo', async () => {
      await expect(
        client.query(
          `INSERT INTO planes_preventivo
             (id, titulo, ubicacion, prioridad_id, tipo_id, responsable_id, intervalo_valor, intervalo_unidad, fecha_inicio, proxima_ejecucion_en, updated_at)
           VALUES (gen_random_uuid(), 'Plan unidad invalida', 'SEDE CENTRAL', $1, ${SQL_TIPO_PLAN}, gen_random_uuid(), 7, 'SEMANAS', '2026-01-01', '2026-01-08', now())`,
          [prioridadId],
        ),
      ).rejects.toThrow(/planes_preventivo_intervalo_unidad_check|check constraint/i);
    });

    it.each(['DIAS', 'MESES'])('acepta la unidad %s', async (unidad) => {
      const result = await client.query(
        `INSERT INTO planes_preventivo
           (id, titulo, ubicacion, prioridad_id, tipo_id, responsable_id, intervalo_valor, intervalo_unidad, fecha_inicio, proxima_ejecucion_en, updated_at)
         VALUES (gen_random_uuid(), $1, 'SEDE CENTRAL', $2, ${SQL_TIPO_PLAN}, gen_random_uuid(), 7, $3, '2026-01-01', '2026-01-08', now())
         RETURNING id`,
        [`Plan unidad ${unidad}`, prioridadId, unidad],
      );
      expect(result.rowCount).toBe(1);
    });
  });

  // ─── preventivo_generacion_resultado_check ────────────────────────────────

  describe('CHECK preventivo_generacion_resultado_check', () => {
    it('rechaza un resultado fuera del catálogo de 4 códigos', async () => {
      const planId = await insertPlanValido();
      await expect(
        client.query(
          `INSERT INTO preventivo_generacion (id, plan_id, fecha_programada, resultado)
           VALUES (gen_random_uuid(), $1, '2026-02-01', 'FOO')`,
          [planId],
        ),
      ).rejects.toThrow(/preventivo_generacion_resultado_check|check constraint/i);
    });

    it.each(RESULTADOS_GENERACION.filter((resultado) => resultado !== 'GENERADO'))(
      'acepta el resultado %s (sin ticket)',
      async (resultado) => {
        const planId = await insertPlanValido();
        const result = await client.query(
          `INSERT INTO preventivo_generacion (id, plan_id, fecha_programada, resultado)
           VALUES (gen_random_uuid(), $1, '2026-02-01', $2)
           RETURNING id`,
          [planId, resultado],
        );
        expect(result.rowCount).toBe(1);
      },
    );
  });

  // ─── preventivo_generacion_ticket_coherencia_check ────────────────────────

  describe('CHECK preventivo_generacion_ticket_coherencia_check', () => {
    it('rechaza resultado=GENERADO con ticket_id NULL', async () => {
      const planId = await insertPlanValido();
      await expect(
        client.query(
          `INSERT INTO preventivo_generacion (id, plan_id, fecha_programada, resultado)
           VALUES (gen_random_uuid(), $1, '2026-02-01', 'GENERADO')`,
          [planId],
        ),
      ).rejects.toThrow(/preventivo_generacion_ticket_coherencia_check|check constraint/i);
    });

    it('rechaza un resultado NO-GENERADO con ticket_id seteado', async () => {
      const planId = await insertPlanValido();
      const ticketId = await insertTicket();
      await expect(
        client.query(
          `INSERT INTO preventivo_generacion (id, plan_id, fecha_programada, resultado, ticket_id)
           VALUES (gen_random_uuid(), $1, '2026-02-01', 'SALTEADO_PENDIENTE', $2)`,
          [planId, ticketId],
        ),
      ).rejects.toThrow(/preventivo_generacion_ticket_coherencia_check|check constraint/i);
    });

    it('acepta GENERADO con ticket_id seteado', async () => {
      const planId = await insertPlanValido();
      const ticketId = await insertTicket();
      const result = await client.query(
        `INSERT INTO preventivo_generacion (id, plan_id, fecha_programada, resultado, ticket_id)
         VALUES (gen_random_uuid(), $1, '2026-02-01', 'GENERADO', $2)
         RETURNING id`,
        [planId, ticketId],
      );
      expect(result.rowCount).toBe(1);
    });
  });

  // ─── preventivo_generacion_plan_fecha_key ([R6] idempotencia) ─────────────

  describe('UNIQUE preventivo_generacion_plan_fecha_key ([R6] idempotencia)', () => {
    it('el segundo INSERT de la misma (plan_id, fecha_programada) choca contra el UNIQUE', async () => {
      const planId = await insertPlanValido();
      await client.query(
        `INSERT INTO preventivo_generacion (id, plan_id, fecha_programada, resultado)
         VALUES (gen_random_uuid(), $1, '2026-03-01', 'SALTEADO_ATRASO')`,
        [planId],
      );
      await expect(
        client.query(
          `INSERT INTO preventivo_generacion (id, plan_id, fecha_programada, resultado)
           VALUES (gen_random_uuid(), $1, '2026-03-01', 'SALTEADO_ATRASO')`,
          [planId],
        ),
      ).rejects.toThrow(/preventivo_generacion_plan_fecha_key|unique constraint/i);
    });

    it('ON CONFLICT DO NOTHING sobre la misma clave devuelve 0 filas (idempotencia real, ADR-PV2)', async () => {
      const planId = await insertPlanValido();
      await client.query(
        `INSERT INTO preventivo_generacion (id, plan_id, fecha_programada, resultado)
         VALUES (gen_random_uuid(), $1, '2026-04-01', 'RESERVADO')`,
        [planId],
      );
      const result = await client.query(
        `INSERT INTO preventivo_generacion (id, plan_id, fecha_programada, resultado)
         VALUES (gen_random_uuid(), $1, '2026-04-01', 'RESERVADO')
         ON CONFLICT (plan_id, fecha_programada) DO NOTHING
         RETURNING id`,
        [planId],
      );
      expect(result.rowCount).toBe(0);
    });
  });

  // ─── Deriva CHECK ↔ TypeScript (mismo criterio que compras-checks.integration.spec.ts) ──
  //
  // `RESULTADOS_GENERACION` vive en TRES lugares independientes: esta unión
  // TS, el CHECK `preventivo_generacion_resultado_check` de la migración
  // `20260825110000_preventivo_planes`, y (hasta esta corrección) los
  // literales hardcodeados del `it.each` de arriba. El riesgo no es que un
  // caller mande un valor inválido (los cuatro resultados salen siempre de
  // literales del código, no del body HTTP): el riesgo es la DERIVA — agregar
  // un resultado a la unión de TS y olvidar la migración (o al revés). Ese
  // desalineamiento no lo atrapa `tsc` ni el CHECK por separado: solo un test
  // que lea la definición REAL del CHECK y la compare contra la constante.

  describe('La lista del CHECK y la de TypeScript no derivan', () => {
    it('preventivo_generacion_resultado_check enumera exactamente RESULTADOS_GENERACION', async () => {
      const result = await client.query(
        'SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = $1',
        ['preventivo_generacion_resultado_check'],
      );
      expect(result.rows).toHaveLength(1);
      const definicion: string = result.rows[0].def;
      const enLaDb = [...definicion.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
      expect(enLaDb).toEqual([...RESULTADOS_GENERACION].sort());
    });

    it('planes_preventivo_intervalo_unidad_check enumera exactamente UNIDADES_INTERVALO', async () => {
      const result = await client.query(
        'SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = $1',
        ['planes_preventivo_intervalo_unidad_check'],
      );
      expect(result.rows).toHaveLength(1);
      const definicion: string = result.rows[0].def;
      const enLaDb = [...definicion.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
      expect(enLaDb).toEqual([...UNIDADES_INTERVALO].sort());
    });
  });

  // ─── Anticipación (odd/preventivo-anticipacion T1) ────────────────────────
  //
  // El dominio (`PlanPreventivoEntity`) es la autoridad; estos CHECKs son el
  // backstop y tienen que coincidir EXACTO con él: ni más estrictos (500
  // crudo para algo que el dominio aceptó) ni más laxos.
  describe('anticipación del plan (S5, S6)', () => {
    /** Inserta un plan con cadencia y anticipación explícitas; el resto, válido. */
    function insertPlanConAnticipacion(p: {
      intervaloValor: number;
      intervaloUnidad: string;
      anticipacionValor: number;
      anticipacionUnidad: string;
    }) {
      return client.query(
        `INSERT INTO planes_preventivo
           (id, titulo, ubicacion, prioridad_id, tipo_id, responsable_id, intervalo_valor, intervalo_unidad,
            anticipacion_valor, anticipacion_unidad, fecha_inicio, proxima_ejecucion_en, updated_at)
         VALUES (gen_random_uuid(), 'Plan anticipacion', 'SEDE CENTRAL', $1, ${SQL_TIPO_PLAN}, gen_random_uuid(),
                 $2, $3, $4, $5, '2026-01-01', '2026-01-01', now())
         RETURNING id`,
        [
          prioridadId,
          p.intervaloValor,
          p.intervaloUnidad,
          p.anticipacionValor,
          p.anticipacionUnidad,
        ],
      );
    }

    it('S5: un plan que no la menciona (como los que ya existían) queda en 0 DIAS', async () => {
      const id = await insertPlanValido({ equipoId: null, ubicacion: 'SEDE CENTRAL' });
      const r = await client.query(
        'SELECT anticipacion_valor, anticipacion_unidad FROM planes_preventivo WHERE id = $1',
        [id],
      );
      expect(r.rows[0]).toEqual({ anticipacion_valor: 0, anticipacion_unidad: 'DIAS' });
    });

    it('rechaza anticipacion_valor negativo', async () => {
      await expect(
        insertPlanConAnticipacion({
          intervaloValor: 7,
          intervaloUnidad: 'DIAS',
          anticipacionValor: -1,
          anticipacionUnidad: 'DIAS',
        }),
      ).rejects.toThrow(/planes_preventivo_anticipacion_valor_check/);
    });

    it('rechaza una unidad de anticipación fuera del catálogo', async () => {
      await expect(
        insertPlanConAnticipacion({
          intervaloValor: 7,
          intervaloUnidad: 'DIAS',
          anticipacionValor: 1,
          anticipacionUnidad: 'SEMANAS',
        }),
      ).rejects.toThrow(/planes_preventivo_anticipacion_unidad_check/);
    });

    it.each([
      // [cadencia, unidad, anticipación, unidad, ¿acepta?] — mismos bordes que el dominio.
      [30, 'DIAS', 29, 'DIAS', true],
      [30, 'DIAS', 30, 'DIAS', false],
      [1, 'MESES', 29, 'DIAS', true],
      [1, 'MESES', 30, 'DIAS', false],
      [30, 'DIAS', 1, 'MESES', false],
      [31, 'DIAS', 1, 'MESES', true],
      [3, 'MESES', 2, 'MESES', true],
      [3, 'MESES', 3, 'MESES', false],
    ] as const)(
      'cadencia %i %s con anticipación %i %s → acepta=%s (mes = 30 días)',
      async (intervaloValor, intervaloUnidad, anticipacionValor, anticipacionUnidad, acepta) => {
        const insert = insertPlanConAnticipacion({
          intervaloValor,
          intervaloUnidad,
          anticipacionValor,
          anticipacionUnidad,
        });
        if (acepta) {
          await expect(insert).resolves.toBeDefined();
        } else {
          await expect(insert).rejects.toThrow(
            /planes_preventivo_anticipacion_menor_cadencia_check/,
          );
        }
      },
    );

    it('planes_preventivo_anticipacion_unidad_check enumera exactamente UNIDADES_INTERVALO', async () => {
      const result = await client.query(
        'SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = $1',
        ['planes_preventivo_anticipacion_unidad_check'],
      );
      expect(result.rows).toHaveLength(1);
      const definicion: string = result.rows[0].def;
      const enLaDb = [...definicion.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
      expect(enLaDb).toEqual([...UNIDADES_INTERVALO].sort());
    });

    it('el CHECK de anticipación menor que la cadencia usa el mismo mes de 30 días que el dominio', async () => {
      const result = await client.query(
        'SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = $1',
        ['planes_preventivo_anticipacion_menor_cadencia_check'],
      );
      const definicion: string = result.rows[0].def;
      const multiplicadores = [...definicion.matchAll(/\* (\d+)/g)].map((m) => Number(m[1]));
      expect(multiplicadores).toEqual([DIAS_POR_MES_ANTICIPACION, DIAS_POR_MES_ANTICIPACION]);
    });

    // Último del archivo: retira y reaplica las columnas de la migración.
    it('rollback.sql retira columnas y CHECKs, se puede correr dos veces, y la migración se reaplica', async () => {
      await client.query(sqlAnticipacion('rollback.sql'));
      await client.query(sqlAnticipacion('rollback.sql'));
      const columnas = await client.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'planes_preventivo' AND column_name LIKE 'anticipacion_%'`,
      );
      expect(columnas.rows).toHaveLength(0);
      const checks = await client.query(
        `SELECT conname FROM pg_constraint WHERE conname LIKE 'planes_preventivo_anticipacion_%'`,
      );
      expect(checks.rows).toHaveLength(0);

      await client.query(sqlAnticipacion('migration.sql'));
      const reaplicadas = await client.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'planes_preventivo' AND column_name LIKE 'anticipacion_%'
          ORDER BY column_name`,
      );
      expect(reaplicadas.rows.map((r) => r.column_name)).toEqual([
        'anticipacion_unidad',
        'anticipacion_valor',
      ]);
    });
  });
});
