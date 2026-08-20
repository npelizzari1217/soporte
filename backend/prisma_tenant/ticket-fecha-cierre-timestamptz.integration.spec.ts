/**
 * ticket-fecha-cierre-timestamptz.integration.spec.ts — WU1
 * (sdd/corregir-fecha-cierre-tickets).
 *
 * Verifica la migración `20260820120000_ticket_fecha_cierre_timestamptz`
 * (design D1/D2) contra Postgres REAL (`soporte_tenant_test`) — mismo patrón
 * de cliente `pg` crudo que `rename-modulo-soporte-a-tickets.integration.spec.ts`
 * y `compras-checks.integration.spec.ts`.
 *
 * RED antes de aplicar la migración: `udt_name` del primer test falla porque
 * la columna todavía es `date`. GREEN después de `pnpm migrate:tenant`.
 *
 * AISLAMIENTO (post-mortem: una corrida previa de este archivo sembró
 * `estados` con `codigo IN ('RESUELTO','CERRADO')` vía `ON CONFLICT DO
 * NOTHING` sin limpiarlas, y esas filas rotas rompieron
 * `prisma-sla-ticket.integration.spec.ts` — que crea SU PROPIO `RESUELTO` y
 * choca contra el índice único de `codigo`). Los tres `it` de este archivo son
 * un `SELECT` a `information_schema`, una evaluación de expresión, y un
 * `INSERT`+`UPDATE` de backfill — ninguno necesita DDL. Por eso TODO corre
 * dentro de una única transacción abierta en `beforeAll` y descartada con
 * `ROLLBACK` en `afterAll`: residuo cero POR CONSTRUCCIÓN, no por acordarse de
 * limpiar. `soporte_tenant_test` es compartida por el resto de la suite de
 * integración — nunca dejar una fila puesta.
 *
 * Ref spec: sdd/corregir-fecha-cierre-tickets/spec — "Historical Closing Data
 * Migrates Without Introducing Skew". Ref design: D1 (cláusula `USING` fija a
 * `-03:00`), D2 (backfill desde `operaciones_ticket`). Tarea: 1.3.
 */
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const TENANT_TEST_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';

const MIGRATION_FILE = path.resolve(
  __dirname,
  './migrations/20260820120000_ticket_fecha_cierre_timestamptz/migration.sql',
);

/** El UPDATE de backfill (D2) es idempotente: recalcula el mismo MAX(created_at)
 * para filas ya correctas, así que ejecutarlo de nuevo sobre la tabla completa
 * (compartida por otras suites) no corrompe datos ajenos — ver comentario en
 * el propio migration.sql. */
function extraerBackfillSql(): string {
  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  const marcador = 'UPDATE "tickets" t';
  const idx = sql.indexOf(marcador);
  if (idx === -1) {
    throw new Error('migration.sql cambió de forma: no se encontró el UPDATE de backfill');
  }
  return sql.slice(idx);
}

describe('Migración 20260820120000 — fecha_cierre timestamptz + backfill (WU1)', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: TENANT_TEST_URL });
    await client.connect();
    // Residuo cero por construcción: todo lo que hacen los `it` de este
    // archivo (SELECTs, un INSERT+UPDATE de backfill) vive dentro de esta
    // única transacción, descartada íntegra al cierre.
    await client.query('BEGIN');
  });

  afterAll(async () => {
    // Orden de higiene: descartar filas (ROLLBACK) ANTES de cerrar el
    // cliente — al revés el pool queda vivo y el ROLLBACK no corre.
    await client.query('ROLLBACK');
    await client.end();
  });

  it('[D1] tickets.fecha_cierre es timestamptz (información de schema)', async () => {
    const result = await client.query(
      `SELECT udt_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'fecha_cierre'`,
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].udt_name).toBe('timestamptz');
  });

  it('[D1] la expresión USING da el MISMO instante bajo TZ de sesión UTC y America/Sao_Paulo', async () => {
    // Reproduce el riesgo central del diseño: un ALTER sin USING resolvería la
    // medianoche contra el TimeZone de sesión (UTC en Docker local,
    // America/Sao_Paulo en prod). El literal INTERVAL '-03:00' NO debe leer
    // ningún GUC de sesión — mismo resultado en las dos.
    const expresion = `('2026-08-13'::date::timestamp AT TIME ZONE INTERVAL '-03:00') AS instante`;

    await client.query(`SET TIME ZONE 'UTC'`);
    const bajoUtc = await client.query(`SELECT ${expresion}`);

    await client.query(`SET TIME ZONE 'America/Sao_Paulo'`);
    const bajoSaoPaulo = await client.query(`SELECT ${expresion}`);

    await client.query(`RESET TIME ZONE`);

    expect(bajoUtc.rows[0].instante.toISOString()).toBe(bajoSaoPaulo.rows[0].instante.toISOString());
    // Medianoche ART (2026-08-13 00:00 -03:00) = 2026-08-13T03:00:00.000Z
    expect(bajoUtc.rows[0].instante.toISOString()).toBe('2026-08-13T03:00:00.000Z');
  });

  describe('[D2] backfill selecciona la última transición de cierre', () => {
    let tipoTicketId: string;
    let prioridadId: string;
    let tipoOperacionId: string;
    let estadoResueltoId: string;
    let estadoCerradoId: string;
    let ticketId: string;

    /** Catálogos RESUELTO/CERRADO son fijos (seeder, `tenant-seeder.adapter.ts`)
     * — pero `soporte_tenant_test` NO corre el seeder (solo está migrada, ver
     * `prisma-tickets.integration.spec.ts`). `ON CONFLICT DO NOTHING` evita
     * chocar si otra suite ya los insertó ANTES de que abriéramos esta
     * transacción; si los insertamos nosotros, quedan visibles solo dentro de
     * esta transacción y desaparecen con el `ROLLBACK` del `afterAll` externo
     * — nunca persisten. */
    async function ensureEstado(codigo: string, nombre: string, orden: number): Promise<string> {
      await client.query(
        `INSERT INTO estados (id, codigo, nombre, orden, activo, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, true, now())
         ON CONFLICT (codigo) DO NOTHING`,
        [codigo, nombre, orden],
      );
      const result = await client.query(`SELECT id FROM estados WHERE codigo = $1`, [codigo]);
      return result.rows[0].id as string;
    }

    beforeAll(async () => {
      estadoResueltoId = await ensureEstado('RESUELTO', 'Resuelto', 40);
      estadoCerradoId = await ensureEstado('CERRADO', 'Cerrado', 50);

      const tipoTicket = await client.query(
        `INSERT INTO tipos_ticket (id, codigo, nombre, modulo, activo, updated_at)
         VALUES (gen_random_uuid(), 'WU1TEST_TIPO', 'Tipo test WU1', 'SOPORTE', true, now())
         RETURNING id`,
      );
      tipoTicketId = tipoTicket.rows[0].id;

      const prioridad = await client.query(
        `INSERT INTO prioridades (id, codigo, nombre, orden, activo, updated_at)
         VALUES (gen_random_uuid(), 'WU1TEST_PRIO', 'Prioridad test WU1', 10, true, now())
         RETURNING id`,
      );
      prioridadId = prioridad.rows[0].id;

      const tipoOperacion = await client.query(
        `INSERT INTO tipo_operacion (id, codigo, nombre, activo, updated_at)
         VALUES (gen_random_uuid(), 'WU1TEST_TIPOOP', 'Tipo operacion test WU1', true, now())
         RETURNING id`,
      );
      tipoOperacionId = tipoOperacion.rows[0].id;
    });

    // Sin `afterAll` acá: el `ROLLBACK` de la transacción externa (línea ~54)
    // descarta estos INSERTs (tipoTicket, prioridad, tipoOperacion, ticket,
    // operaciones_ticket, y el `estado` si lo creamos nosotros) sin necesidad
    // de un DELETE dirigido.

    it('un ticket con dos transiciones de cierre (RESUELTO→CERRADO) termina con el instante MÁS RECIENTE', async () => {
      const solicitanteId = '01900000-0000-7000-8000-000000000099';
      const primerCierre = new Date('2026-08-13T20:00:00.000Z');
      const segundoCierre = new Date('2026-08-14T02:30:00.000Z'); // 23:30 ART del 13/08

      const ticket = await client.query(
        `INSERT INTO tickets (id, numero, titulo, tipo_id, estado_id, prioridad_id, solicitante_id, fecha_cierre, updated_at)
         VALUES (gen_random_uuid(), 'WU1TEST-00001', 'Ticket test backfill', $1, $2, $3, $4, '2000-01-01T00:00:00Z', now())
         RETURNING id`,
        [tipoTicketId, estadoResueltoId, prioridadId, solicitanteId],
      );
      ticketId = ticket.rows[0].id;

      await client.query(
        `INSERT INTO operaciones_ticket (id, ticket_id, tipo_operacion_id, estado_nuevo_id, autor_id, es_interno, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, false, $5, now())`,
        [ticketId, tipoOperacionId, estadoResueltoId, solicitanteId, primerCierre],
      );
      await client.query(
        `INSERT INTO operaciones_ticket (id, ticket_id, tipo_operacion_id, estado_nuevo_id, autor_id, es_interno, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, false, $5, now())`,
        [ticketId, tipoOperacionId, estadoCerradoId, solicitanteId, segundoCierre],
      );

      await client.query(extraerBackfillSql());

      const result = await client.query(`SELECT fecha_cierre FROM tickets WHERE id = $1`, [
        ticketId,
      ]);
      expect((result.rows[0].fecha_cierre as Date).toISOString()).toBe(segundoCierre.toISOString());
    });
  });
});
