/**
 * tickets-sla-regla.integration.spec.ts — WU-3 (sdd/sla-habil).
 *
 * Contra Postgres REAL: ejerce la columna `sla_regla` de la migración
 * `20260909130000_add_sla_regla_tickets` (CHECK + patrón expand/backfill de
 * DEFAULT) de punta a punta — mismo criterio que
 * `calendario-laboral-dias-check.integration.spec.ts` (WU-1: la autoridad
 * es la DB, no la lectura del DDL) y `preventivo-schema.integration.spec.ts`
 * (tenant efímero propio).
 *
 * TENANT EFÍMERO: DB física creada/migrada/borrada por este spec vía
 * `PostgresAdminService`/`TenantMigrationRunnerAdapter` — NUNCA la
 * `soporte_tenant_test` compartida. Necesario para el test de "backfill":
 * togglear el DEFAULT de la columna de un lado a otro es seguro porque la
 * DB entera se tira al final, sin afectar a ningún otro spec.
 *
 * Cliente `pg` crudo (no Prisma) a propósito: el sujeto bajo prueba es la
 * restricción/DEFAULT de la columna, no el mapper de aplicación (ese ya
 * tiene su unit spec en `ticket.mapper.spec.ts`).
 *
 * ALCANCE HONESTO de los tests de DEFAULT: ejercen el DEFAULT de la COLUMNA,
 * que es el mecanismo real por el que las filas YA EXISTENTES quedaron en
 * `'CORRIDO'` durante el DDL. Las filas nuevas de la aplicación NO pasan por
 * ahí: Prisma resuelve el `@default("HABIL")` del schema del lado del
 * cliente y lo manda en el INSERT. Son dos fuentes espejadas — ver el
 * docstring de `SlaRegla`.
 *
 * Ref: sdd/sla-habil WU-3.
 */
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { SLA_REGLAS } from '../../../domain/entities/ticket.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_slaregla_${randomBytes(4).toString('hex')}_test`;

/** Deriva la URL del tenant efímero reemplazando el nombre de DB en `MASTER_TEST_URL`. */
function buildTenantUrl(dbName: string): string {
  const url = new URL(MASTER_TEST_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}

describe('tickets.sla_regla — CHECK y DEFAULT expand/backfill (WU-3, tenant efímero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const migrationRunner = new TenantMigrationRunnerAdapter(MASTER_TEST_URL);
  let client: Client;

  let tipoId: string;
  let estadoId: string;
  let prioridadId: string;
  let ticketCounter = 0;

  beforeAll(async () => {
    // DB física efímera, real, migrada (incluye la migración bajo prueba) —
    // NUNCA soporte_master* ni soporte_tenant_test.
    await admin.createDatabase(TENANT_DB_NAME);
    await migrationRunner.run(TENANT_DB_NAME);

    client = new Client({ connectionString: buildTenantUrl(TENANT_DB_NAME) });
    await client.connect();

    const prioridad = await client.query(
      `INSERT INTO prioridades (id, codigo, nombre, updated_at)
       VALUES (gen_random_uuid(), 'TEST_WU3', 'Prioridad test WU-3', now())
       RETURNING id`,
    );
    prioridadId = prioridad.rows[0].id as string;

    const estado = await client.query(
      `INSERT INTO estados (id, codigo, nombre, updated_at)
       VALUES (gen_random_uuid(), 'TEST_WU3_NUEVO', 'Nuevo test WU-3', now())
       RETURNING id`,
    );
    estadoId = estado.rows[0].id as string;

    const tipo = await client.query(
      `INSERT INTO tipos_ticket (id, codigo, nombre, modulo, updated_at)
       VALUES (gen_random_uuid(), 'TEST_WU3_SOPORTE', 'Soporte test WU-3', 'SOPORTE', now())
       RETURNING id`,
    );
    tipoId = tipo.rows[0].id as string;
  }, 60_000);

  afterAll(async () => {
    // Sin filas que limpiar: la DB entera es efímera y propia de este spec.
    await client.end();
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 60_000);

  /**
   * Inserta un ticket válido SIN mencionar `sla_regla` en la lista de
   * columnas — a propósito: es la única forma de ejercer el DEFAULT vigente
   * de la columna en vez de un valor hardcodeado por el test.
   */
  async function insertTicketSinSlaRegla(): Promise<{ id: string; slaRegla: string }> {
    ticketCounter += 1;
    const result = await client.query(
      `INSERT INTO tickets (id, numero, titulo, tipo_id, estado_id, prioridad_id, solicitante_id, updated_at)
       VALUES (gen_random_uuid(), $1, 'Ticket test WU-3', $2, $3, $4, gen_random_uuid(), now())
       RETURNING id, sla_regla`,
      [`WU3TEST-${ticketCounter}`, tipoId, estadoId, prioridadId],
    );
    // Devuelve los DOS: el id lo necesita el test del UPDATE y el valor los
    // del DEFAULT. Devolver solo uno obliga al otro a usarlo como si fuera
    // el que no es.
    return { id: result.rows[0].id as string, slaRegla: result.rows[0].sla_regla as string };
  }

  describe('CHECK tickets_sla_regla_check', () => {
    it('rechaza un valor fuera del catálogo cerrado', async () => {
      ticketCounter += 1;
      await expect(
        client.query(
          `INSERT INTO tickets
             (id, numero, titulo, tipo_id, estado_id, prioridad_id, solicitante_id, sla_regla, updated_at)
           VALUES (gen_random_uuid(), $1, 'Ticket test WU-3', $2, $3, $4, gen_random_uuid(), 'OTRO', now())`,
          [`WU3TEST-${ticketCounter}`, tipoId, estadoId, prioridadId],
        ),
      ).rejects.toThrow(/tickets_sla_regla_check/i);
    });

    it.each(['CORRIDO', 'HABIL'])('acepta el valor %s explícito', async (valor) => {
      ticketCounter += 1;
      const result = await client.query(
        `INSERT INTO tickets
           (id, numero, titulo, tipo_id, estado_id, prioridad_id, solicitante_id, sla_regla, updated_at)
         VALUES (gen_random_uuid(), $1, 'Ticket test WU-3', $2, $3, $4, gen_random_uuid(), $5, now())
         RETURNING id`,
        [`WU3TEST-${ticketCounter}`, tipoId, estadoId, prioridadId, valor],
      );
      expect(result.rowCount).toBe(1);
    });

    /**
     * El CHECK enumera valores que TypeScript también enumera. El riesgo NO
     * es que llegue un valor inválido desde afuera —`sla_regla` no sale de
     * ningún body HTTP—: es la DERIVA. Agregar una cohorte a `SLA_REGLAS` y
     * olvidar la migración deja el INSERT rechazado por el CHECK. Mismo
     * patrón que `movimientos-insumo-constraints.integration.spec.ts`.
     */
    it('el CHECK real enumera exactamente SLA_REGLAS', async () => {
      const filas = await client.query(
        `SELECT pg_get_constraintdef(oid) AS def
           FROM pg_constraint
          WHERE conname = 'tickets_sla_regla_check'`,
      );

      expect(filas.rowCount).toBe(1);
      const enLaDb = [...(filas.rows[0].def as string).matchAll(/'([A-Z_]+)'/g)]
        .map((m) => m[1])
        .sort();
      expect(enLaDb).toEqual([...SLA_REGLAS].sort());
    });

    it('un UPDATE que deja la columna en un valor fuera de catálogo también es rechazado', async () => {
      const { id } = await insertTicketSinSlaRegla();
      await expect(
        client.query('UPDATE tickets SET sla_regla = $1 WHERE id = $2', ['OTRO', id]),
      ).rejects.toThrow(/tickets_sla_regla_check/i);
    });
  });

  /**
   * El requisito explícito del WU: "una fila insertada nace HABIL, y el
   * backfill dejó las viejas en CORRIDO". El estado FINAL de la migración
   * (después de correr `migrate deploy`, arriba en `beforeAll`) es DEFAULT
   * 'HABIL' — se prueba insertando SIN mencionar la columna. El
   * comportamiento de BACKFILL (por qué las filas viejas quedan en
   * 'CORRIDO') es el mecanismo de Postgres al hacer `ADD COLUMN ... DEFAULT
   * 'CORRIDO' NOT NULL`: cualquier fila insertada MIENTRAS ese es el
   * DEFAULT vigente recibe 'CORRIDO' — se reproduce togglando el DEFAULT de
   * ida y vuelta sobre la MISMA columna/CHECK reales que dejó la migración,
   * no sobre una tabla de juguete.
   */
  describe('DEFAULT — patrón expand/backfill (una fila nueva nace HABIL, una vieja quedó CORRIDO)', () => {
    it('con el DEFAULT vigente de la migración (HABIL), una fila insertada nace HABIL', async () => {
      const { slaRegla } = await insertTicketSinSlaRegla();
      expect(slaRegla).toBe('HABIL');
    });

    it('reproduce el DEFAULT con el que nacieron las filas viejas (CORRIDO) antes del segundo ALTER', async () => {
      await client.query(`ALTER TABLE tickets ALTER COLUMN sla_regla SET DEFAULT 'CORRIDO'`);
      try {
        const { slaRegla: slaReglaVieja } = await insertTicketSinSlaRegla();
        expect(slaReglaVieja).toBe('CORRIDO');
      } finally {
        // Restaura el DEFAULT final de la migración — no deja la DB efímera
        // en un estado intermedio para los tests que corren después.
        await client.query(`ALTER TABLE tickets ALTER COLUMN sla_regla SET DEFAULT 'HABIL'`);
      }

      const { slaRegla: slaReglaNueva } = await insertTicketSinSlaRegla();
      expect(slaReglaNueva).toBe('HABIL');
    });
  });
});
