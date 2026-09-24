/**
 * feriados-globales-master.checker.integration.spec.ts — WU3b, sdd/feriados-configurables.
 *
 * Contra Postgres REAL (mismo patrón que
 * `calendario-laboral.repositorios.integration.spec.ts`): ejerce
 * `FeriadosGlobalesMasterChecker.esGlobal()` sin mockear Prisma.
 *
 * Higiene de datos (soporte/CLAUDE.md, design.md D4): la tabla `feriados`
 * NUNCA se truncatea — las 46 filas sembradas por migración (rango
 * 2026-2028) deben sobrevivir la suite. El fixture propio usa una fecha de
 * 2031 (fuera de ese rango) y se borra por `id` en `afterAll`.
 */
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { usarLockMasterTest } from '../../../../testing/lock-master-test';
import { FechaCalendario } from '../../../domain/value-objects/fecha-calendario';
import { FeriadosGlobalesMasterChecker } from './feriados-globales-master.checker';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

usarLockMasterTest();

describe('FeriadosGlobalesMasterChecker — Integration (WU3b, sdd/feriados-configurables)', () => {
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let checker: FeriadosGlobalesMasterChecker;
  let idFixturePropio: string | null = null;

  beforeAll(() => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    masterClient = prismaService.getMasterClient();
    checker = new FeriadosGlobalesMasterChecker(prismaService);
  });

  afterAll(async () => {
    if (idFixturePropio) {
      await masterClient.feriado.delete({ where: { id: idFixturePropio } });
    }
    await prismaService.onModuleDestroy();
  });

  it('devuelve true para una fecha sembrada por la migración (Navidad 2026-12-25)', async () => {
    const fecha = FechaCalendario.crear('2026-12-25').getOrThrow();

    await expect(checker.esGlobal(fecha)).resolves.toBe(true);
  });

  it('devuelve false para una fecha que no es feriado global', async () => {
    const fecha = FechaCalendario.crear('2026-01-15').getOrThrow();

    await expect(checker.esGlobal(fecha)).resolves.toBe(false);
  });

  it('devuelve true para un feriado propio recién creado (fuera del rango sembrado)', async () => {
    const fecha = FechaCalendario.crear('2031-06-10').getOrThrow();
    const creado = await masterClient.feriado.create({
      data: { fecha: fecha.aDateUtc(), descripcion: 'WU3b test' },
    });
    idFixturePropio = creado.id;

    await expect(checker.esGlobal(fecha)).resolves.toBe(true);
  });
});
