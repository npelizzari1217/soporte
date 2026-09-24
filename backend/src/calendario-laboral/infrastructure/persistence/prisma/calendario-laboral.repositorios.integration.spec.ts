/**
 * calendario-laboral.repositorios.integration.spec.ts — WU-2 (sdd/sla-habil),
 * unión global+cliente desde WU5b (sdd/feriados-configurables, fix H4).
 *
 * Contra Postgres REAL: ejerce `PrismaCalendarioLaboralSemanalRepository`
 * contra `soporte_master_test` (mismo patrón que
 * `calendario-laboral-dias-check.integration.spec.ts`), y
 * `PrismaFeriadosLaboralesRepository` contra MASTER + una DB tenant EFÍMERA
 * (`PostgresAdminService`/`TenantMigrationRunnerAdapter`, mismo patrón que
 * `prisma-feriado-cliente.repository.integration.spec.ts`) — desde WU5b este
 * repositorio requiere un `TenantContext` bindeado (D3, fail-closed), así
 * que ya no se lo construye ni se lo llama sin contexto (H4: antes de este
 * fix, `feriadosRepo.obtener()` corría unbound y bajo el fail-closed
 * lanzaría en cada test de este describe).
 */
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import {
  MasterPrismaClient,
  TenantPrismaClient,
} from '../../../../shared/infrastructure/persistence/prisma-clients';
import { TenantContext, TenantContextData } from '../../../../shared/tenancy/tenant-context';
import { usarLockMasterTest } from '../../../../testing/lock-master-test';
import { PrismaCalendarioLaboralSemanalRepository } from './prisma-calendario-laboral-semanal.repository';
import {
  FeriadosSinTenantContextError,
  PrismaFeriadosLaboralesRepository,
} from './prisma-feriados-laborales.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const DB_NAME = `soporte_feriados_laborales_${randomBytes(4).toString('hex')}_test`;

usarLockMasterTest();

describe('Repositorios Prisma de calendario laboral — Integration (WU-2, sdd/sla-habil; WU5b, sdd/feriados-configurables)', () => {
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let rawClient: Client;
  let calendarioRepo: PrismaCalendarioLaboralSemanalRepository;
  let feriadosRepo: PrismaFeriadosLaboralesRepository;

  // DB tenant efímera para el lado "propio del cliente" de la unión (D3/H4).
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const migrationRunner = new TenantMigrationRunnerAdapter(MASTER_TEST_URL);
  const tenantContext = new TenantContext();
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let ctx: TenantContextData;

  /** Ejecuta `fn` con el TenantContext bindeado vía `run()` (ver JSDoc de `prisma-feriado-cliente.repository.integration.spec.ts`). */
  function conContexto<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(ctx, fn);
  }

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    masterClient = prismaService.getMasterClient();
    calendarioRepo = new PrismaCalendarioLaboralSemanalRepository(prismaService);
    feriadosRepo = new PrismaFeriadosLaboralesRepository(prismaService, tenantContext);

    rawClient = new Client({ connectionString: MASTER_TEST_URL });
    await rawClient.connect();

    await admin.createDatabase(DB_NAME);
    await migrationRunner.run(DB_NAME);
    tenantClient = prismaService.getTenantClient(DB_NAME);
    ctx = {
      prismaClient: tenantClient,
      dbName: DB_NAME,
      clienteId: 'test-cliente-feriados-laborales',
    };
  }, 60_000);

  afterAll(async () => {
    await prismaService.onModuleDestroy();
    await rawClient.end();
    await admin.dropDatabase(DB_NAME);
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
      await tenantClient.feriadoCliente.deleteMany({});
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

    it('lee un feriado global y devuelve su clave de día LOCAL, sin desplazamiento', () =>
      conContexto(async () => {
        const creado = await masterClient.feriado.create({
          data: { fecha: new Date(Date.UTC(2099, 2, 10)), descripcion: 'WU-2 test' },
        });
        idFeriadoDePrueba = creado.id;

        const feriados = await feriadosRepo.obtener();

        expect(feriados.has('2099-03-10')).toBe(true);
        expect(feriados.has('2099-03-09')).toBe(false); // el día que daría el desplazamiento (bug)
      }));

    it('no marca como feriado un día vecino que no fue cargado', () =>
      conContexto(async () => {
        const creado = await masterClient.feriado.create({
          data: { fecha: new Date(Date.UTC(2099, 2, 10)), descripcion: 'WU-2 test' },
        });
        idFeriadoDePrueba = creado.id;

        const feriados = await feriadosRepo.obtener();

        expect(feriados.has('2099-03-11')).toBe(false);
      }));

    it('incluye la UNIÓN del feriado global y el feriado propio del cliente (D3)', () =>
      conContexto(async () => {
        const creado = await masterClient.feriado.create({
          data: { fecha: new Date(Date.UTC(2099, 5, 1)), descripcion: 'Global de prueba' },
        });
        idFeriadoDePrueba = creado.id;
        await tenantClient.feriadoCliente.create({
          data: { fecha: new Date(Date.UTC(2099, 6, 15)), descripcion: 'Propio de prueba' },
        });

        const feriados = await feriadosRepo.obtener();

        expect(feriados.has('2099-06-01')).toBe(true);
        expect(feriados.has('2099-07-15')).toBe(true);
      }));

    it('deduplica cuando la misma fecha existe en global Y en el cliente', () =>
      conContexto(async () => {
        const creado = await masterClient.feriado.create({
          data: { fecha: new Date(Date.UTC(2099, 8, 9)), descripcion: 'Global de prueba' },
        });
        idFeriadoDePrueba = creado.id;
        await tenantClient.feriadoCliente.create({
          data: { fecha: new Date(Date.UTC(2099, 8, 9)), descripcion: 'Mismo día, cliente' },
        });

        const feriados = await feriadosRepo.obtener();

        expect(Array.from(feriados).filter((clave) => clave === '2099-09-09')).toHaveLength(1);
      }));

    it('lanza FeriadosSinTenantContextError si corre sin TenantContext bindeado (D3, fail-closed)', async () => {
      // Deliberadamente FUERA de `conContexto()`.
      await expect(feriadosRepo.obtener()).rejects.toThrow(FeriadosSinTenantContextError);
    });
  });
});
