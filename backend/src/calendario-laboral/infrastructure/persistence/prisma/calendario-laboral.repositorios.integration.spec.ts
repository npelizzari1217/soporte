/**
 * calendario-laboral.repositorios.integration.spec.ts — WU-3
 * (sdd/horario-laboral-por-cliente, H2).
 *
 * Contra Postgres REAL: ejerce `PrismaCalendarioLaboralSemanalRepository`
 * contra una DB tenant EFÍMERA (`PostgresAdminService`/
 * `TenantMigrationRunnerAdapter`, mismo patrón que
 * `prisma-feriado-cliente.repository.integration.spec.ts:27-50`) — desde
 * este WU el repositorio lee `calendario_laboral_dias_cliente` del tenant
 * vía `TenantContext` y ya no toca `soporte_master_test`, así que este
 * archivo no necesita `usarLockMasterTest()`.
 *
 * La cobertura de `PrismaFeriadosLaboralesRepository` (unión global+cliente)
 * vivía antes en este mismo archivo; queda fuera de alcance de este WU y ya
 * está cubierta por `prisma-feriados-laborales.repository.spec.ts` (unit,
 * con mocks) sin duplicar Postgres real.
 */
import { randomBytes } from 'node:crypto';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { TenantContext, TenantContextData } from '../../../../shared/tenancy/tenant-context';
import {
  CalendarioLaboralSinTenantContextError,
  PrismaCalendarioLaboralSemanalRepository,
} from './prisma-calendario-laboral-semanal.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const DB_NAME = `soporte_calendario_laboral_${randomBytes(4).toString('hex')}_test`;

describe('PrismaCalendarioLaboralSemanalRepository — Integration (WU-3, sdd/horario-laboral-por-cliente)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const migrationRunner = new TenantMigrationRunnerAdapter(MASTER_TEST_URL);
  const tenantContext = new TenantContext();

  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let ctx: TenantContextData;
  let repo: PrismaCalendarioLaboralSemanalRepository;

  /** Ejecuta `fn` con el TenantContext bindeado vía `run()` (ver JSDoc de `prisma-feriado-cliente.repository.integration.spec.ts`). */
  function conContexto<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(ctx, fn);
  }

  beforeAll(async () => {
    await admin.createDatabase(DB_NAME);
    await migrationRunner.run(DB_NAME);

    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(DB_NAME);
    ctx = {
      prismaClient: tenantClient,
      dbName: DB_NAME,
      clienteId: 'test-cliente-calendario-laboral',
    };
    repo = new PrismaCalendarioLaboralSemanalRepository(tenantContext);
  }, 60_000);

  afterAll(async () => {
    await prismaService.onModuleDestroy();
    await admin.dropDatabase(DB_NAME);
  });

  it('lee las 7 filas sembradas por defecto como la tupla semanal', () =>
    conContexto(async () => {
      const semanal = await repo.obtener();

      expect(semanal[0]).toEqual({ aperturaMinuto: null, cierreMinuto: null });
      expect(semanal[1]).toEqual({ aperturaMinuto: 540, cierreMinuto: 1080 });
      expect(semanal[6]).toEqual({ aperturaMinuto: null, cierreMinuto: null });
    }));

  it('lanza si el calendario en la base queda incompleto', () =>
    conContexto(async () => {
      await tenantClient.calendarioLaboralDiaCliente.delete({ where: { diaSemana: 6 } });
      try {
        await expect(repo.obtener()).rejects.toThrow(/6/);
      } finally {
        // Re-siembra la fila borrada para no dejar la base rota para otro test.
        await tenantClient.calendarioLaboralDiaCliente.create({
          data: { diaSemana: 6, aperturaMinuto: null, cierreMinuto: null },
        });
      }
    }));

  it('lanza CalendarioLaboralSinTenantContextError si corre sin TenantContext bindeado (D4, fail-closed)', async () => {
    // Deliberadamente FUERA de `conContexto()`.
    await expect(repo.obtener()).rejects.toThrow(CalendarioLaboralSinTenantContextError);
  });
});
