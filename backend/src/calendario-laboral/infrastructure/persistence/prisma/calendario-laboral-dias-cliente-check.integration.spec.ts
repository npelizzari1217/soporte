/**
 * calendario-laboral-dias-cliente-check.integration.spec.ts — WU-1
 * (sdd/horario-laboral-por-cliente). Ref design D1. Ref tasks: 1.3.
 *
 * Prueba los CHECK de la migración `20260928150000_calendario_laboral_dias_cliente`
 * contra Postgres REAL: un INSERT/UPDATE raw (sin pasar por ninguna
 * validación de dominio, todavía inexistente en WU-1) debe ser rechazado
 * cuando viola el invariante. Mismo patrón de CHECK que
 * `calendario-laboral-dias-check.integration.spec.ts` (tabla hermana de
 * MASTER), pero sobre una DB tenant EFÍMERA — mismo patrón de
 * infraestructura que `prisma-feriado-cliente.repository.integration.spec.ts`:
 * crea `soporte_horario_laboral_<rand>_test`, migra con
 * `TenantMigrationRunnerAdapter` (subproceso real de `prisma migrate
 * deploy`) y la borra en `afterAll`. Nunca toca `soporte_master_test`.
 *
 * Hygiene order: desconectar el client Prisma → `dropDatabase`.
 */
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';

const MASTER_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const DB_NAME = `soporte_horario_laboral_${randomBytes(4).toString('hex')}_test`;

/** Las 7 filas sembradas por la migración (default 9-18 L-V, S-D cerrado). */
const FILAS_POR_DEFECTO: ReadonlyArray<{
  diaSemana: number;
  aperturaMinuto: number | null;
  cierreMinuto: number | null;
}> = [
  { diaSemana: 0, aperturaMinuto: null, cierreMinuto: null },
  { diaSemana: 1, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 2, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 3, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 4, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 5, aperturaMinuto: 540, cierreMinuto: 1080 },
  { diaSemana: 6, aperturaMinuto: null, cierreMinuto: null },
];

const VENTANA_CHECK = /calendario_laboral_dias_cliente_ventana_check/i;
const DIA_SEMANA_CHECK = /calendario_laboral_dias_cliente_dia_semana_check/i;

describe('CHECK calendario_laboral_dias_cliente — Integration (WU-1, sdd/horario-laboral-por-cliente)', () => {
  const admin = new PostgresAdminService(MASTER_URL);
  const migrationRunner = new TenantMigrationRunnerAdapter(MASTER_URL);

  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let rawClient: Client;

  /** Re-siembra las 7 filas por defecto vía UPSERT (algún test las borra o edita). */
  async function resembrarDefault(): Promise<void> {
    for (const fila of FILAS_POR_DEFECTO) {
      await tenantClient.calendarioLaboralDiaCliente.upsert({
        where: { diaSemana: fila.diaSemana },
        create: { ...fila, updatedAt: new Date() },
        update: { aperturaMinuto: fila.aperturaMinuto, cierreMinuto: fila.cierreMinuto },
      });
    }
  }

  beforeAll(async () => {
    await admin.createDatabase(DB_NAME);
    await migrationRunner.run(DB_NAME);

    prismaService = new PrismaService(MASTER_URL);
    tenantClient = prismaService.getTenantClient(DB_NAME);

    // Cliente pg crudo: ejerce el CHECK de DB directamente, sin pasar por
    // ninguna validación de aplicación (que en WU-1 todavía no existe).
    const url = new URL(MASTER_URL);
    url.pathname = `/${DB_NAME}`;
    rawClient = new Client({ connectionString: url.toString() });
    await rawClient.connect();
  }, 60_000);

  afterAll(async () => {
    await rawClient.end();
    await prismaService.onModuleDestroy();
    await admin.dropDatabase(DB_NAME);
  });

  it('siembra exactamente las 7 filas, L-V 09:00–18:00 y sábado/domingo cerrados', async () => {
    const filas = await tenantClient.calendarioLaboralDiaCliente.findMany({
      orderBy: { diaSemana: 'asc' },
    });

    expect(filas).toHaveLength(7);
    expect(filas.map((f) => f.diaSemana)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(filas[0]!.aperturaMinuto).toBeNull();
    expect(filas[6]!.aperturaMinuto).toBeNull();
    for (const diaHabil of [1, 2, 3, 4, 5]) {
      const fila = filas.find((f) => f.diaSemana === diaHabil);
      expect(fila!.aperturaMinuto).toBe(540);
      expect(fila!.cierreMinuto).toBe(1080);
    }
  });

  it('CHECK dia_semana_check rechaza dia_semana = 7 (fuera de 0..6)', async () => {
    await expect(
      rawClient.query(
        `INSERT INTO calendario_laboral_dias_cliente (dia_semana, apertura_minuto, cierre_minuto, updated_at)
         VALUES (7, NULL, NULL, now())`,
      ),
    ).rejects.toThrow(DIA_SEMANA_CHECK);
  });

  describe('CHECK ventana_check — INSERT raw', () => {
    // La PK (dia_semana) cubre 0..6 con las 7 filas fijas del seed. Para
    // ejercer el INSERT (no el UPDATE) sin confundirlo con el CHECK de
    // dia_semana, cada caso libera momentáneamente el domingo (dia_semana=6)
    // con DELETE y lo reinserta con la ventana bajo prueba.
    afterEach(resembrarDefault);

    const violaciones: ReadonlyArray<[string, number | null, number | null]> = [
      ['ventana invertida (apertura >= cierre)', 1080, 540],
      ['ventana vacía (apertura === cierre)', 600, 600],
      ['extremo NULL — apertura sin cierre', 540, null],
      ['extremo NULL — cierre sin apertura', null, 1080],
      ['apertura_minuto negativo', -1, 540],
      ['cierre_minuto > 1440', 540, 1441],
    ];

    it.each(violaciones)('rechaza %s', async (_desc, apertura, cierre) => {
      await rawClient.query('DELETE FROM calendario_laboral_dias_cliente WHERE dia_semana = 6');
      await expect(
        rawClient.query(
          `INSERT INTO calendario_laboral_dias_cliente (dia_semana, apertura_minuto, cierre_minuto, updated_at)
           VALUES (6, ${apertura ?? 'NULL'}, ${cierre ?? 'NULL'}, now())`,
        ),
      ).rejects.toThrow(VENTANA_CHECK);
    });

    it('acepta ambos extremos NULL (día cerrado)', async () => {
      await rawClient.query('DELETE FROM calendario_laboral_dias_cliente WHERE dia_semana = 6');
      const result = await rawClient.query(
        `INSERT INTO calendario_laboral_dias_cliente (dia_semana, apertura_minuto, cierre_minuto, updated_at)
         VALUES (6, NULL, NULL, now()) RETURNING dia_semana`,
      );
      expect(result.rowCount).toBe(1);
    });

    it('acepta una ventana válida (apertura < cierre)', async () => {
      await rawClient.query('DELETE FROM calendario_laboral_dias_cliente WHERE dia_semana = 6');
      const result = await rawClient.query(
        `INSERT INTO calendario_laboral_dias_cliente (dia_semana, apertura_minuto, cierre_minuto, updated_at)
         VALUES (6, 480, 780, now()) RETURNING dia_semana`,
      );
      expect(result.rowCount).toBe(1);
    });
  });

  describe('CHECK ventana_check — UPDATE raw sobre una fila existente', () => {
    afterEach(resembrarDefault);

    it('rechaza dejar la ventana del lunes invertida', async () => {
      await expect(
        rawClient.query(
          `UPDATE calendario_laboral_dias_cliente SET apertura_minuto = 1080, cierre_minuto = 540 WHERE dia_semana = 1`,
        ),
      ).rejects.toThrow(VENTANA_CHECK);
    });

    it('rechaza dejar un solo extremo NULL en el martes', async () => {
      await expect(
        rawClient.query(
          `UPDATE calendario_laboral_dias_cliente SET cierre_minuto = NULL WHERE dia_semana = 2`,
        ),
      ).rejects.toThrow(VENTANA_CHECK);
    });

    it('acepta cerrar un día editando ambos extremos a NULL', async () => {
      const result = await rawClient.query(
        `UPDATE calendario_laboral_dias_cliente SET apertura_minuto = NULL, cierre_minuto = NULL WHERE dia_semana = 3 RETURNING dia_semana`,
      );
      expect(result.rowCount).toBe(1);
    });
  });

  it('re-ejecutar el seed (ON CONFLICT DO NOTHING) no pisa una fila ya editada', async () => {
    // Edita el miércoles a mano, simulando un guardado de usuario.
    await rawClient.query(
      `UPDATE calendario_laboral_dias_cliente SET apertura_minuto = 600, cierre_minuto = 900 WHERE dia_semana = 3`,
    );

    // Re-ejecuta EXACTAMENTE el INSERT del seed de la migración.
    await rawClient.query(`
      INSERT INTO "calendario_laboral_dias_cliente" ("dia_semana", "apertura_minuto", "cierre_minuto", "updated_at") VALUES
        (0, NULL, NULL, CURRENT_TIMESTAMP), (1, 540, 1080, CURRENT_TIMESTAMP),
        (2, 540, 1080, CURRENT_TIMESTAMP), (3, 540, 1080, CURRENT_TIMESTAMP),
        (4, 540, 1080, CURRENT_TIMESTAMP), (5, 540, 1080, CURRENT_TIMESTAMP),
        (6, NULL, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT ("dia_semana") DO NOTHING;
    `);

    const miercoles = await tenantClient.calendarioLaboralDiaCliente.findUniqueOrThrow({
      where: { diaSemana: 3 },
    });
    expect(miercoles.aperturaMinuto).toBe(600);
    expect(miercoles.cierreMinuto).toBe(900);

    await resembrarDefault();
  });
});
