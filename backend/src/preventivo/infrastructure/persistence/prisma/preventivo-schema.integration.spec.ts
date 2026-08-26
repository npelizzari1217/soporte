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
import { Client } from 'pg';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { RESULTADOS_GENERACION } from '../../../domain/ports/i-preventivo-generacion.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_prevschema_${randomBytes(4).toString('hex')}_test`;

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
         (id, titulo, equipo_id, ubicacion, prioridad_id, responsable_id,
          intervalo_valor, intervalo_unidad, fecha_inicio, proxima_ejecucion_en, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, gen_random_uuid(), 7, 'DIAS', '2026-01-01', '2026-01-08', now())
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
             (id, titulo, ubicacion, prioridad_id, responsable_id, intervalo_valor, intervalo_unidad, fecha_inicio, proxima_ejecucion_en, updated_at)
           VALUES (gen_random_uuid(), 'Plan intervalo cero', 'SEDE CENTRAL', $1, gen_random_uuid(), 0, 'DIAS', '2026-01-01', '2026-01-08', now())`,
          [prioridadId],
        ),
      ).rejects.toThrow(/planes_preventivo_intervalo_valor_check|check constraint/i);
    });

    it('rechaza intervalo_valor negativo', async () => {
      await expect(
        client.query(
          `INSERT INTO planes_preventivo
             (id, titulo, ubicacion, prioridad_id, responsable_id, intervalo_valor, intervalo_unidad, fecha_inicio, proxima_ejecucion_en, updated_at)
           VALUES (gen_random_uuid(), 'Plan intervalo negativo', 'SEDE CENTRAL', $1, gen_random_uuid(), -1, 'DIAS', '2026-01-01', '2026-01-08', now())`,
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
             (id, titulo, ubicacion, prioridad_id, responsable_id, intervalo_valor, intervalo_unidad, fecha_inicio, proxima_ejecucion_en, updated_at)
           VALUES (gen_random_uuid(), 'Plan unidad invalida', 'SEDE CENTRAL', $1, gen_random_uuid(), 7, 'SEMANAS', '2026-01-01', '2026-01-08', now())`,
          [prioridadId],
        ),
      ).rejects.toThrow(/planes_preventivo_intervalo_unidad_check|check constraint/i);
    });

    it.each(['DIAS', 'MESES'])('acepta la unidad %s', async (unidad) => {
      const result = await client.query(
        `INSERT INTO planes_preventivo
           (id, titulo, ubicacion, prioridad_id, responsable_id, intervalo_valor, intervalo_unidad, fecha_inicio, proxima_ejecucion_en, updated_at)
         VALUES (gen_random_uuid(), $1, 'SEDE CENTRAL', $2, gen_random_uuid(), 7, $3, '2026-01-01', '2026-01-08', now())
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
  });
});
