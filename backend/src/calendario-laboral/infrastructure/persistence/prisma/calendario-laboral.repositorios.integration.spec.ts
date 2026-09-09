/**
 * calendario-laboral.repositorios.integration.spec.ts — WU-2 (sdd/sla-habil).
 *
 * Contra Postgres REAL (mismo patrón que
 * `calendario-laboral-dias-check.integration.spec.ts`): ejerce los dos
 * adaptadores Prisma de MASTER de punta a punta, sin mockear el cliente.
 */
import { Client } from 'pg';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { usarLockMasterTest } from '../../../../testing/lock-master-test';
import { PrismaCalendarioLaboralSemanalRepository } from './prisma-calendario-laboral-semanal.repository';
import { PrismaFeriadosLaboralesRepository } from './prisma-feriados-laborales.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

usarLockMasterTest();

describe('Repositorios Prisma de calendario laboral — Integration (WU-2, sdd/sla-habil)', () => {
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let rawClient: Client;
  let calendarioRepo: PrismaCalendarioLaboralSemanalRepository;
  let feriadosRepo: PrismaFeriadosLaboralesRepository;

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    masterClient = prismaService.getMasterClient();
    calendarioRepo = new PrismaCalendarioLaboralSemanalRepository(prismaService);
    feriadosRepo = new PrismaFeriadosLaboralesRepository(prismaService);

    rawClient = new Client({ connectionString: MASTER_TEST_URL });
    await rawClient.connect();
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
    await rawClient.end();
  });

  describe('PrismaCalendarioLaboralSemanalRepository', () => {
    it('lee las 7 filas sembradas por defecto como la tupla semanal', async () => {
      const semanal = await calendarioRepo.obtener();

      expect(semanal[0]).toEqual({ aperturaMinuto: null, cierreMinuto: null });
      expect(semanal[1]).toEqual({ aperturaMinuto: 540, cierreMinuto: 1080 });
      expect(semanal[6]).toEqual({ aperturaMinuto: null, cierreMinuto: null });
    });

    it('lanza si el calendario en la base queda incompleto', async () => {
      await rawClient.query('DELETE FROM calendario_laboral_dias WHERE dia_semana = 6');
      try {
        await expect(calendarioRepo.obtener()).rejects.toThrow(/6/);
      } finally {
        // Re-siembra la fila borrada para no dejar la base rota para otro spec.
        await rawClient.query(
          `INSERT INTO calendario_laboral_dias (dia_semana, apertura_minuto, cierre_minuto, updated_at)
           VALUES (6, NULL, NULL, now())
           ON CONFLICT (dia_semana) DO UPDATE
             SET apertura_minuto = NULL, cierre_minuto = NULL`,
        );
      }
    });
  });

  describe('PrismaFeriadosLaboralesRepository', () => {
    // Fechas fuera del rango 2026-2028 que siembra la migración de este WU
    // (`seed_feriados_nacionales_inamovibles`): estos tests no dependen de
    // esa siembra — insertan y borran su propia fila — para no terminar
    // probando la migración en lugar del repositorio/mapper.
    let idFeriadoDePrueba: string | null = null;

    afterEach(async () => {
      if (!idFeriadoDePrueba) {
        return;
      }
      // Sin catch: `soporte_master_test` es una base COMPARTIDA por toda la
      // suite, y un borrado que falla en silencio deja una fila colgada que
      // puede ensuciar otra corrida. La fila siempre existe — la crea el
      // propio test —, así que un fallo en este punto es un problema real y
      // tiene que verse. Se limpia el id igual para no reintentar sobre uno
      // ya borrado.
      const id = idFeriadoDePrueba;
      idFeriadoDePrueba = null;
      await masterClient.feriado.delete({ where: { id } });
    });

    it('lee un feriado propio y devuelve su clave de día LOCAL, sin desplazamiento', async () => {
      const creado = await masterClient.feriado.create({
        data: { fecha: new Date(Date.UTC(2099, 2, 10)), descripcion: 'WU-2 test' },
      });
      idFeriadoDePrueba = creado.id;

      const feriados = await feriadosRepo.obtener();

      expect(feriados.has('2099-03-10')).toBe(true);
      expect(feriados.has('2099-03-09')).toBe(false); // el día que daría el desplazamiento (bug)
    });

    it('no marca como feriado un día vecino que no fue cargado', async () => {
      const creado = await masterClient.feriado.create({
        data: { fecha: new Date(Date.UTC(2099, 2, 10)), descripcion: 'WU-2 test' },
      });
      idFeriadoDePrueba = creado.id;

      const feriados = await feriadosRepo.obtener();

      expect(feriados.has('2099-03-11')).toBe(false);
    });
  });
});
