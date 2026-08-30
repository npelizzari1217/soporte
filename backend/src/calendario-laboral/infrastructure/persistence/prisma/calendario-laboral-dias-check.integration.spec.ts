/**
 * calendario-laboral-dias-check.integration.spec.ts — WU-1 (sdd/sla-habil).
 *
 * Prueba el CHECK `calendario_laboral_dias_ventana_check` de la migración
 * `20260824130000_add_calendario_laboral` contra Postgres REAL: un INSERT/UPDATE
 * raw (que no pasa por la validación de la entidad de dominio, todavía
 * inexistente en WU-1) tiene que ser rechazado por la DB cuando viola el
 * invariante del calendario (ambos extremos NULL, o ambos NOT NULL con
 * apertura < cierre). Mismo patrón que el CHECK `ciclos_vigentes_fecha_fin_check`
 * en `prisma-ciclo-repos.integration.spec.ts`.
 */
import { Client } from 'pg';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { usarLockMasterTest } from '../../../../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

/** Las 7 filas fijas sembradas por `seed_calendario_laboral_default` (molde default). */
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

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('CHECK calendario_laboral_dias_ventana_check — Integration (WU-1, sdd/sla-habil)', () => {
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let rawClient: Client;

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    masterClient = prismaService.getMasterClient();

    // Cliente pg crudo: ejerce el CHECK de DB directamente, sin pasar por
    // ninguna validación de aplicación (que en WU-1 todavía no existe).
    rawClient = new Client({ connectionString: MASTER_TEST_URL });
    await rawClient.connect();
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
    await rawClient.end();
  });

  afterEach(async () => {
    // Re-siembra las 7 filas por defecto vía UPSERT (no UPDATE): algún test
    // borra e reinserta una fila (INSERT positivo del CHECK), así que un
    // UPDATE simple la dejaría perdida si el propio test no la recreó. El
    // UPSERT cubre ambos casos — mutada in-place o borrada — y no deja el
    // calendario en un estado que otro spec de integración pueda leer como
    // "roto" (WU-1, WU-4, WU-6).
    for (const fila of FILAS_POR_DEFECTO) {
      await masterClient.$executeRawUnsafe(
        `INSERT INTO calendario_laboral_dias (dia_semana, apertura_minuto, cierre_minuto, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (dia_semana) DO UPDATE
           SET apertura_minuto = EXCLUDED.apertura_minuto,
               cierre_minuto = EXCLUDED.cierre_minuto`,
        fila.diaSemana,
        fila.aperturaMinuto,
        fila.cierreMinuto,
      );
    }
  });

  describe('INSERT raw', () => {
    // La PK (dia_semana) cubre 0..6 con las 7 filas fijas del seed. Para
    // ejercer el INSERT (no el UPDATE) del CHECK `..._ventana_check` SIN
    // conflundirlo con el otro CHECK (`..._dia_semana_check`, que rechaza
    // cualquier valor fuera de 0..6 sin importar la ventana), cada test
    // libera momentáneamente una fila válida con DELETE y reinserta esa
    // MISMA dia_semana con la ventana bajo prueba. Un valor fuera de 0..6
    // (ej. 99) haría fallar por el CHECK equivocado y el test "pasaría" sin
    // haber probado nada del invariante de ventana — la clase de test que
    // no muerde que este proyecto prohíbe.
    it('rechaza apertura_minuto >= cierre_minuto (ventana invertida)', async () => {
      await rawClient.query('DELETE FROM calendario_laboral_dias WHERE dia_semana = 6');
      await expect(
        rawClient.query(
          `INSERT INTO calendario_laboral_dias (dia_semana, apertura_minuto, cierre_minuto, updated_at)
           VALUES (6, 1080, 540, now())`,
        ),
      ).rejects.toThrow(/calendario_laboral_dias_ventana_check/i);
    });

    it('rechaza apertura_minuto === cierre_minuto (ventana vacía)', async () => {
      await rawClient.query('DELETE FROM calendario_laboral_dias WHERE dia_semana = 6');
      await expect(
        rawClient.query(
          `INSERT INTO calendario_laboral_dias (dia_semana, apertura_minuto, cierre_minuto, updated_at)
           VALUES (6, 600, 600, now())`,
        ),
      ).rejects.toThrow(/calendario_laboral_dias_ventana_check/i);
    });

    it('rechaza un solo extremo NULL (apertura sin cierre)', async () => {
      await rawClient.query('DELETE FROM calendario_laboral_dias WHERE dia_semana = 6');
      await expect(
        rawClient.query(
          `INSERT INTO calendario_laboral_dias (dia_semana, apertura_minuto, cierre_minuto, updated_at)
           VALUES (6, 540, NULL, now())`,
        ),
      ).rejects.toThrow(/calendario_laboral_dias_ventana_check/i);
    });

    it('rechaza un solo extremo NULL (cierre sin apertura)', async () => {
      await rawClient.query('DELETE FROM calendario_laboral_dias WHERE dia_semana = 6');
      await expect(
        rawClient.query(
          `INSERT INTO calendario_laboral_dias (dia_semana, apertura_minuto, cierre_minuto, updated_at)
           VALUES (6, NULL, 1080, now())`,
        ),
      ).rejects.toThrow(/calendario_laboral_dias_ventana_check/i);
    });

    it('acepta ambos extremos NULL (día cerrado)', async () => {
      await rawClient.query('DELETE FROM calendario_laboral_dias WHERE dia_semana = 6');
      const result = await rawClient.query(
        `INSERT INTO calendario_laboral_dias (dia_semana, apertura_minuto, cierre_minuto, updated_at)
         VALUES (6, NULL, NULL, now())
         RETURNING dia_semana`,
      );
      expect(result.rowCount).toBe(1);
    });

    it('acepta una ventana válida (apertura < cierre)', async () => {
      await rawClient.query('DELETE FROM calendario_laboral_dias WHERE dia_semana = 6');
      const result = await rawClient.query(
        `INSERT INTO calendario_laboral_dias (dia_semana, apertura_minuto, cierre_minuto, updated_at)
         VALUES (6, 480, 780, now())
         RETURNING dia_semana`,
      );
      expect(result.rowCount).toBe(1);
    });
  });

  describe('UPDATE raw sobre una fila existente', () => {
    it('rechaza dejar la ventana del lunes invertida', async () => {
      await expect(
        rawClient.query(
          `UPDATE calendario_laboral_dias SET apertura_minuto = 1080, cierre_minuto = 540 WHERE dia_semana = 1`,
        ),
      ).rejects.toThrow(/calendario_laboral_dias_ventana_check/i);
    });

    it('rechaza dejar un solo extremo NULL en el martes', async () => {
      await expect(
        rawClient.query(
          `UPDATE calendario_laboral_dias SET cierre_minuto = NULL WHERE dia_semana = 2`,
        ),
      ).rejects.toThrow(/calendario_laboral_dias_ventana_check/i);
    });

    it('acepta cerrar un día editando ambos extremos a NULL', async () => {
      const result = await rawClient.query(
        `UPDATE calendario_laboral_dias SET apertura_minuto = NULL, cierre_minuto = NULL WHERE dia_semana = 3 RETURNING dia_semana`,
      );
      expect(result.rowCount).toBe(1);
    });
  });

  describe('seed por defecto', () => {
    it('siembra exactamente las 7 filas, L-V 09:00–18:00 y sábado/domingo cerrados', async () => {
      const filas = await masterClient.calendarioLaboralDia.findMany({
        orderBy: { diaSemana: 'asc' },
      });

      expect(filas).toHaveLength(7);
      expect(filas.map((f) => f.diaSemana)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(filas[0]!.aperturaMinuto).toBeNull();
      expect(filas[0]!.cierreMinuto).toBeNull();
      expect(filas[6]!.aperturaMinuto).toBeNull();
      expect(filas[6]!.cierreMinuto).toBeNull();
      for (const diaHabil of [1, 2, 3, 4, 5]) {
        const fila = filas.find((f) => f.diaSemana === diaHabil);
        expect(fila!.aperturaMinuto).toBe(540);
        expect(fila!.cierreMinuto).toBe(1080);
      }
    });
  });
});
